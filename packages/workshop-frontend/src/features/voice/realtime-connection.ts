import type { RpcStub } from "capnweb";
import type { AuthenticatedApi } from "@gadgets/workshop-shared/api";

// Where the browser trades its SDP offer for OpenAI's answer, with the session's ephemeral key.
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
// How long the event channel may take to open once the answer is applied.
const OPEN_TIMEOUT_MS = 15_000;
// How often the loudness is sampled for the call bar.
const LEVEL_INTERVAL_MS = 100;

/** A server event of the realtime session; `type` names it (see OpenAI's Realtime API). */
export type RealtimeEvent = { type: string } & Record<string, unknown>;

/** How loud the user and the assistant are (RMS, 0-1). */
export type VoiceLevels = { user: number; assistant: number };

/**
 * One WebRTC connection to an OpenAI realtime session: the microphone goes up, the model's voice
 * comes down and plays, and JSON events travel on the data channel. The browser does echo
 * cancellation, so the model hears the user over its own voice.
 */
export class RealtimeConnection {
  #closed = false;
  #levelListeners = new Set<(levels: VoiceLevels) => void>();
  #levelTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly peer: RTCPeerConnection,
    private readonly events: RTCDataChannel,
    private readonly microphone: MediaStream,
    private readonly speaker: HTMLAudioElement,
    private readonly audio: AudioContext,
  ) {}

  /**
   * Connects a session minted by `api.startVoiceSession`. `onEvent` gets every server event;
   * `onLost` is called once if the connection drops afterwards (not after `close`).
   */
  static async open(api: RpcStub<AuthenticatedApi>, language: string,
                    onEvent: (event: RealtimeEvent) => void,
                    onLost: () => void): Promise<RealtimeConnection> {
    let [microphone, grant] = await Promise.all([openMicrophone(), api.startVoiceSession(language)]);
    let peer = new RTCPeerConnection();
    let speaker = new Audio();
    speaker.autoplay = true;
    let audio = new AudioContext();
    let connection: RealtimeConnection | null = null;
    try {
      let remote = Promise.withResolvers<MediaStream>();
      peer.addEventListener("track", (event) => {
        remote.resolve(event.streams[0] ?? new MediaStream([event.track]));
      });
      for (let track of microphone.getAudioTracks()) peer.addTrack(track, microphone);
      // The channel must exist before the offer, so that the offer carries it.
      let events = peer.createDataChannel("oai-events");
      connection = new RealtimeConnection(peer, events, microphone, speaker, audio);
      let opened = channelOpened(events);
      events.addEventListener("message", ({ data }) => {
        let event = parseEvent(data);
        if (event) onEvent(event);
      });
      let offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      let response = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${grant.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!response.ok) {
        console.warn("Realtime call rejected:", response.status, await response.text());
        throw new Error("Voice mode could not connect.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      await opened;
      let stream = await remote.promise;
      speaker.srcObject = stream;
      connection.#meter(microphone, stream);
      let lost = () => {
        if (connection && !connection.#closed) onLost();
      };
      events.addEventListener("close", lost);
      peer.addEventListener("connectionstatechange", () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed") lost();
      });
      return connection;
    } catch (error) {
      if (connection) connection.close();
      else {
        microphone.getTracks().forEach((track) => track.stop());
        peer.close();
        void audio.close();
      }
      throw error;
    }
  }

  /** Sends a client event; dropped once the connection is closed. */
  send(event: { type: string } & Record<string, unknown>): void {
    if (this.events.readyState === "open") this.events.send(JSON.stringify(event));
  }

  setMuted(muted: boolean): void {
    for (let track of this.microphone.getAudioTracks()) track.enabled = !muted;
  }

  /** Calls `listener` with the user's and the model's loudness (RMS, 0-1) ten times a second. */
  onLevel(listener: (levels: VoiceLevels) => void): () => void {
    this.#levelListeners.add(listener);
    return () => this.#levelListeners.delete(listener);
  }

  /** Hangs up and releases the microphone. Safe to call twice. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#levelTimer);
    this.events.close();
    this.peer.close();
    this.microphone.getTracks().forEach((track) => track.stop());
    this.speaker.srcObject = null;
    void this.audio.close();
  }

  #meter(microphone: MediaStream, remote: MediaStream): void {
    let analyse = (stream: MediaStream) => {
      let analyser = this.audio.createAnalyser();
      analyser.fftSize = 1024;
      this.audio.createMediaStreamSource(stream).connect(analyser);
      return analyser;
    };
    let user = analyse(microphone);
    let assistant = analyse(remote);
    let samples = new Float32Array(1024);
    let rms = (analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let sample of samples) sum += sample * sample;
      return Math.sqrt(sum / samples.length);
    };
    this.#levelTimer = setInterval(() => {
      let levels = { user: rms(user), assistant: rms(assistant) };
      this.#levelListeners.forEach((listener) => listener(levels));
    }, LEVEL_INTERVAL_MS);
  }
}

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      throw new Error("Microphone access was denied.", { cause: error });
    }
    throw error;
  }
}

function channelOpened(channel: RTCDataChannel): Promise<void> {
  let { promise, resolve, reject } = Promise.withResolvers<void>();
  let timer = setTimeout(() => reject(new Error("Voice mode could not connect.")), OPEN_TIMEOUT_MS);
  channel.addEventListener("open", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  return promise;
}

function parseEvent(data: unknown): RealtimeEvent | null {
  if (typeof data !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !("type" in parsed) || typeof parsed.type !== "string") {
    return null;
  }
  return { ...parsed, type: parsed.type };
}

/** The message of an `error` server event, fit to show the user. */
export function realtimeErrorMessage(event: RealtimeEvent): string {
  let error = event.error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Voice mode hit an error.";
}
