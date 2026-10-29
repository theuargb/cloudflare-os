import type { RpcStub } from "capnweb";
import {
  MAX_VOICE_CALL_MS,
  VOICE_AGENT_TOOL,
  type AiChatMessage,
  type AuthenticatedApi,
} from "@gadgets/workshop-shared/api";
import { AgentRelay, chatContext, parseAgentRequest, type RelayChatState } from "./agent-relay";
import { chime } from "./chime";
import {
  RealtimeConnection,
  realtimeErrorMessage,
  type RealtimeEvent,
  type VoiceLevels,
} from "./realtime-connection";

export type VoiceCallPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "blocked";

export type VoiceCallSnapshot = {
  phase: VoiceCallPhase;
  /** The chat the call talks in; null until its first request starts a new chat. */
  chatId: number | null;
  /** What the user or the assistant is saying, as transcribed. */
  caption: string;
  muted: boolean;
  /** What went wrong last; when `phase` is idle, why the call ended. */
  error: string | null;
};

/** The page a call talks through: the chat it shows and how to post to it. */
export type VoiceCallHost = {
  /** The chat the page shows, or null for none. */
  chatId: number | null;
  isAgentActive: boolean;
  /** Messages sent while the agent worked that it has not read yet; they restart it. */
  hasQueuedSteers: boolean;
  /** Set while the shown chat waits on the user (an approval). */
  blockedReason?: string;
  /** Posts a spoken message to `chatId`, or to a new chat when null; resolves to the chat. */
  send(text: string, chatId: number | null): Promise<number>;
  /**
   * The shown chat's messages after `afterSequence`, ascending, or its latest page when absent;
   * absent on pages that show no chat.
   */
  readChat?(chatId: number, afterSequence?: number): Promise<AiChatMessage[]>;
};

/** A page's hold on the call; the last page attached is the one the call talks through. */
export type VoiceCallHostLink = {
  /** The host's state changed. */
  changed(): void;
  detach(): void;
};

// How long an error stays on the bar.
const ERROR_MS = 4_000;
// How long a call that just started a chat waits for a page to show it.
const CHAT_OPEN_TIMEOUT_MS = 15_000;

const IDLE: VoiceCallSnapshot = { phase: "idle", chatId: null, caption: "", muted: false, error: null };

type Call = {
  chatId: number | null;
  // The call just started its chat and waits for a page to show it.
  opening: boolean;
  connection: RealtimeConnection | null;
  relay: AgentRelay;
  sending: number;
  // The assistant's voice is playing.
  speaking: boolean;
  // The assistant is generating a response; another must wait for it.
  responding: boolean;
  respondNext: boolean;
  chimed: boolean;
  timers: Set<ReturnType<typeof setTimeout>>;
};

/**
 * The tab's voice-mode call: the user talks with an OpenAI realtime assistant, which passes their
 * requests to the chat agent (its one function, run here) and retells the answers. It outlives
 * page changes, so a call started on a new chat follows that chat into the page that opens it.
 * A store for `useSyncExternalStore`.
 */
export class VoiceCallController {
  #snapshot = IDLE;
  #subscribers = new Set<() => void>();
  #levelListeners = new Set<(levels: VoiceLevels) => void>();
  #host: (() => VoiceCallHost) | null = null;
  #call: Call | null = null;

  constructor(private readonly api: RpcStub<AuthenticatedApi>) {}

  subscribe = (subscriber: () => void): (() => void) => {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  };

  getSnapshot = (): VoiceCallSnapshot => this.#snapshot;

  /** Calls `listener` with the user's and the assistant's loudness (RMS, 0-1) ten times a second. */
  onLevel(listener: (levels: VoiceLevels) => void): () => void {
    this.#levelListeners.add(listener);
    return () => this.#levelListeners.delete(listener);
  }

  attach(host: () => VoiceCallHost): VoiceCallHostLink {
    this.#host = host;
    this.#hostChanged();
    return {
      changed: () => {
        if (this.#host === host) this.#hostChanged();
      },
      detach: () => {
        if (this.#host !== host) return;
        this.#host = null;
        // Leaving the page ends the call, unless it is carrying a new chat to the next page.
        let call = this.#call;
        if (call && !call.opening && !(call.chatId === null && call.sending > 0)) this.end();
      },
    };
  }

  /** Starts a call in `chatId`, or toward a new chat when null. */
  async start(chatId: number | null): Promise<void> {
    if (this.#call || !this.#host) return;
    let call: Call = {
      chatId, opening: false, connection: null, relay: this.#relay(() => call), sending: 0,
      speaking: false, responding: false, respondNext: false, chimed: false, timers: new Set(),
    };
    call.chimed = Boolean(this.#chatState(call)?.blockedReason);
    // A new chat has nothing the voice model has not heard.
    if (chatId === null) call.relay.begin(0);
    this.#call = call;
    this.#set({ ...IDLE, phase: "connecting", chatId });
    try {
      let language = (document.documentElement.lang || "en").split("-")[0];
      let connection = await RealtimeConnection.open(this.api, language,
          (event) => this.#onEvent(call, event),
          () => {
            if (this.#call === call) this.end("Voice mode ended: connection lost.");
          });
      if (this.#call !== call) return connection.close();
      call.connection = connection;
      connection.onLevel((levels) => this.#levelListeners.forEach((listener) => listener(levels)));
      this.#set({ ...this.#snapshot, phase: "listening" });
      this.#later(call, () => this.end(), MAX_VOICE_CALL_MS);
      await this.#seedContext(call);
      call.relay.chatChanged();
      this.#derivePhase();
    } catch (error) {
      if (this.#call === call) this.end(errorMessage(error));
    }
  }

  /** Ends the call and releases the microphone. Safe to call when idle. */
  end(error?: string): void {
    let call = this.#call;
    if (!call) return;
    this.#call = null;
    call.relay.dispose();
    call.connection?.close();
    call.timers.forEach(clearTimeout);
    this.#set({ ...IDLE, error: error ?? null });
  }

  toggleMute(): void {
    let connection = this.#call?.connection;
    if (!connection) return;
    let muted = !this.#snapshot.muted;
    connection.setMuted(muted);
    this.#set({ ...this.#snapshot, muted });
  }

  /** Silences what the assistant is saying. */
  skipReply(): void {
    let call = this.#call;
    if (!call?.connection) return;
    if (call.responding) call.connection.send({ type: "response.cancel" });
    call.connection.send({ type: "output_audio_buffer.clear" });
  }

  /** Taps every chat's messages; a message in the call's chat may end the agent's turn. */
  message(msg: AiChatMessage): void {
    if (this.#call?.chatId === msg.chatId) this.#call.relay.chatChanged();
  }

  // The relay runs only once the call exists; `getCall` defers the reference until then.
  #relay(getCall: () => Call): AgentRelay {
    return new AgentRelay({
      chatState: () => this.#chatState(getCall()),
      readChat: (afterSequence) => {
        let { chatId } = getCall();
        let host = this.#host?.();
        return chatId !== null && host?.chatId === chatId && host.readChat
          ? host.readChat(chatId, afterSequence)
          : null;
      },
      send: (text) => this.#send(getCall(), text),
      answer: (callId, output) => {
        getCall().connection?.send({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output },
        });
        this.#respond(getCall());
      },
      report: (text) => {
        getCall().connection?.send({
          type: "conversation.item.create",
          item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
        });
        this.#respond(getCall());
      },
      changed: () => this.#derivePhase(),
    });
  }

  async #send(call: Call, text: string): Promise<void> {
    let host = this.#host?.();
    if (!host || call.opening || (call.chatId === null && call.sending > 0)) {
      throw new Error("the chat is still opening; try again in a moment.");
    }
    call.sending++;
    try {
      let chatId = await host.send(text, call.chatId);
      if (this.#call === call && call.chatId === null) this.#openChat(call, chatId);
    } finally {
      call.sending--;
    }
  }

  // A call joining an existing chat learns what it is about; the relay reports what comes after.
  async #seedContext(call: Call): Promise<void> {
    let host = this.#host?.();
    if (call.chatId === null || host?.chatId !== call.chatId || !host.readChat) return;
    let messages = await host.readChat(call.chatId).catch(() => null);
    if (this.#call !== call) return;
    call.relay.begin(messages ? messages.at(-1)?.sequence ?? 0 : null);
    let context = messages && chatContext(messages);
    if (context) {
      call.connection?.send({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: context }] },
      });
    }
  }

  #onEvent(call: Call, event: RealtimeEvent): void {
    if (this.#call !== call) return;
    switch (event.type) {
      case "output_audio_buffer.started":
        call.speaking = true;
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        call.speaking = false;
        break;
      case "response.created":
        call.responding = true;
        break;
      case "response.done":
        call.responding = false;
        if (call.respondNext) this.#respond(call);
        break;
      case "conversation.item.input_audio_transcription.completed":
      case "response.output_audio_transcript.done":
        if (typeof event.transcript === "string") this.#set({ ...this.#snapshot, caption: event.transcript });
        break;
      case "response.function_call_arguments.done":
        this.#onFunctionCall(call, event);
        break;
      case "error":
        this.#showError(call, realtimeErrorMessage(event));
        break;
    }
    this.#derivePhase();
  }

  #onFunctionCall(call: Call, event: RealtimeEvent): void {
    let callId = typeof event.call_id === "string" ? event.call_id : null;
    if (!callId) return;
    let request = event.name === VOICE_AGENT_TOOL ? parseAgentRequest(event.arguments) : null;
    if (!request) {
      call.connection?.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: "Unknown function or empty request." },
      });
      this.#respond(call);
      return;
    }
    void call.relay.ask(callId, request);
  }

  // Asks the assistant to speak, once the response under way (if any) is done.
  #respond(call: Call): void {
    if (call.responding) {
      call.respondNext = true;
      return;
    }
    call.respondNext = false;
    call.connection?.send({ type: "response.create" });
  }

  // The first request started a chat: the call moves into it once a page shows it.
  #openChat(call: Call, chatId: number): void {
    call.chatId = chatId;
    call.opening = true;
    this.#set({ ...this.#snapshot, chatId });
    this.#later(call, () => {
      if (call.opening) this.end();
    }, CHAT_OPEN_TIMEOUT_MS);
    this.#hostChanged();
  }

  #hostChanged(): void {
    let call = this.#call;
    let host = this.#host?.();
    if (!call || !host || call.chatId === null) return;
    if (host.chatId !== call.chatId) {
      // A call in an open chat ends when the page leaves it.
      if (!call.opening) this.end();
      return;
    }
    call.opening = false;
    if (host.blockedReason && !call.chimed) chime();
    call.chimed = Boolean(host.blockedReason);
    call.relay.chatChanged();
    this.#derivePhase();
  }

  // The call's chat, if the attached page shows it.
  #chatState(call: Call): RelayChatState | null {
    let host = this.#host?.();
    return host && call.chatId !== null && host.chatId === call.chatId
      ? { isAgentActive: host.isAgentActive, hasQueuedSteers: host.hasQueuedSteers, blockedReason: host.blockedReason }
      : null;
  }

  #derivePhase(): void {
    let call = this.#call;
    if (!call || this.#snapshot.phase === "idle" || this.#snapshot.phase === "connecting") return;
    let chat = this.#chatState(call);
    let phase: VoiceCallPhase = chat?.blockedReason ? "blocked"
        : call.speaking ? "speaking"
        : call.relay.working || chat?.isAgentActive || call.responding || call.opening ? "thinking"
        : "listening";
    if (phase !== this.#snapshot.phase) this.#set({ ...this.#snapshot, phase });
  }

  #showError(call: Call, error: string): void {
    this.#set({ ...this.#snapshot, error });
    this.#later(call, () => {
      if (this.#snapshot.error === error) this.#set({ ...this.#snapshot, error: null });
    }, ERROR_MS);
  }

  #later(call: Call, callback: () => void, ms: number): void {
    let timer = setTimeout(() => {
      call.timers.delete(timer);
      callback();
    }, ms);
    call.timers.add(timer);
  }

  #set(snapshot: VoiceCallSnapshot): void {
    this.#snapshot = snapshot;
    this.#subscribers.forEach((subscriber) => subscriber());
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
