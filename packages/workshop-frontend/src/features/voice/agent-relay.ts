import type { ActionLogEntry, AiChatMessage } from "@gadgets/workshop-shared/api";

// The most of an update handed to the voice model; its tail, where the answer is.
const MAX_REPLY_CHARS = 6_000;
// How many recent chat messages seed a call started in an existing chat.
const CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_MESSAGE_CHARS = 600;
// How long the chat must stay quiet before a stopped agent counts as done: the backend ends a pass
// before it starts the next (leftover steers, a resumed decision), so a stop alone is no answer.
const SETTLE_MS = 1_200;
// How long a sent request may take to start the agent.
const START_GRACE_MS = 15_000;
// How long a resolved approval, or steers the agent has not read, may take to restart the agent.
const RESUME_GRACE_MS = 10_000;

/** The call's chat as its page shows it; null while no page shows it. */
export type RelayChatState = {
  isAgentActive: boolean;
  /** Messages sent while the agent worked that it has not read yet; they restart it. */
  hasQueuedSteers: boolean;
  blockedReason?: string;
};

/** What the relay needs from the call. */
export type RelayDeps = {
  chatState(): RelayChatState | null;
  /**
   * The call's chat after `afterSequence` (its tail when absent), or null while no page shows it.
   */
  readChat(afterSequence?: number): Promise<AiChatMessage[]> | null;
  /** Posts a request to the call's chat (a new chat if it has none yet). */
  send(text: string): Promise<void>;
  /** Fulfils the voice model's function call `callId` with `output`. */
  answer(callId: string, output: string): void;
  /** Tells the voice model something it did not ask for, so it can tell the user. */
  report(text: string): void;
  /** `working` changed. */
  changed(): void;
};

/** An approval or connection request the voice model was told is waiting on the user. */
export type RelayDecision = {
  sequence: number;
  /** The agent resumes once the user resolves it (unless they decline). */
  awaits: boolean;
  /** When it was first seen resolved with the agent not yet resumed. */
  resolvedSeenAt?: number;
};

export type RelayOutcome = {
  lines: string[];
  /** Set when a resolved decision's resume has not started yet: look again then. */
  resumePendingUntil?: number;
  newDecisions: Map<string, RelayDecision>;
  resolvedKeys: string[];
  lastSequence: number;
};

/**
 * Carries the voice model's `ask_agent` calls to the chat agent and tells it what happens in the
 * call's chat. A request becomes a spoken message; whenever the agent stops and the chat stays
 * quiet, everything new since the last update (the agent's messages, approvals and their outcomes,
 * errors) answers the waiting request, or is reported unasked (a turn resumed after an approval,
 * a Retry).
 */
export class AgentRelay {
  // The last chat sequence the voice model has been told about; null until known.
  #cursor: number | null = null;
  #ask: { callId: string; sentAt: number; sawActive: boolean } | null = null;
  #decisions = new Map<string, RelayDecision>();
  // Since when the stopped agent has had unread steers.
  #steersSince: number | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #checking = false;
  #recheck = false;
  #disposed = false;

  constructor(private readonly deps: RelayDeps) {}

  /** Whether a request is with the agent. */
  get working(): boolean {
    return this.#ask !== null;
  }

  /** Sets the last chat sequence the voice model knows about (null: read it when needed). */
  begin(cursor: number | null): void {
    this.#cursor = cursor;
  }

  async ask(callId: string, request: string): Promise<void> {
    let reason = this.deps.chatState()?.blockedReason;
    if (reason) {
      this.deps.answer(callId, `Nothing was sent: the agent is waiting for the user in the chat. ${reason}`);
      return;
    }
    if (this.#ask) {
      try {
        await this.deps.send(request);
      } catch (error) {
        this.deps.answer(callId, `The request did not reach the agent: ${errorMessage(error)}`);
        return;
      }
      this.deps.answer(callId,
          "Passed on to the agent, which is still working on the earlier request; " +
          "its answer will cover this too.");
      this.chatChanged();
      return;
    }
    this.#ask = { callId, sentAt: Date.now(), sawActive: false };
    this.deps.changed();
    await this.#ensureCursor();
    try {
      await this.deps.send(request);
    } catch (error) {
      this.#ask = null;
      this.deps.changed();
      this.deps.answer(callId, `The request did not reach the agent: ${errorMessage(error)}`);
      return;
    }
    this.chatChanged();
  }

  /** The call's chat changed (agent state, approvals, or a new message): look once it is quiet. */
  chatChanged(): void {
    if (this.#disposed) return;
    if (this.deps.chatState()?.isAgentActive) {
      if (this.#ask) this.#ask.sawActive = true;
      for (let decision of this.#decisions.values()) decision.resolvedSeenAt = undefined;
    }
    this.#schedule(SETTLE_MS);
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
  }

  #schedule(ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#run(), Math.max(0, ms));
  }

  #run(): void {
    if (this.#disposed) return;
    if (this.#checking) {
      this.#recheck = true;
      return;
    }
    this.#checking = true;
    void this.#check().catch(() => {}).finally(() => {
      this.#checking = false;
      if (this.#recheck) {
        this.#recheck = false;
        this.#run();
      }
    });
  }

  async #ensureCursor(): Promise<void> {
    if (this.#cursor !== null) return;
    let tail = this.deps.readChat();
    if (!tail) return;
    this.#cursor = (await tail.catch(() => []))?.at(-1)?.sequence ?? 0;
  }

  async #check(): Promise<void> {
    let state = this.deps.chatState();
    if (!state || state.isAgentActive) {
      this.#steersSince = null;
      return;
    }
    let now = Date.now();
    // Unread steers restart a stopped agent, unless it waits on the user.
    if (state.hasQueuedSteers && !state.blockedReason) {
      this.#steersSince ??= now;
      let left = RESUME_GRACE_MS - (now - this.#steersSince);
      if (left > 0) return this.#schedule(left);
    } else {
      this.#steersSince = null;
    }
    let ask = this.#ask;
    if (ask && !ask.sawActive) {
      let left = START_GRACE_MS - (now - ask.sentAt);
      if (left > 0) return this.#schedule(left);
    }
    await this.#ensureCursor();
    if (this.#cursor === null) return;
    let cursor = this.#cursor;
    let from = Math.min(cursor, ...[...this.#decisions.values()].map((decision) => decision.sequence - 1));
    let messages = await this.deps.readChat(from);
    if (!messages || this.#disposed) return;
    state = this.deps.chatState();
    if (!state || state.isAgentActive) return;

    let outcome = describeOutcome(messages, cursor, this.#decisions, Date.now());
    if (outcome.resumePendingUntil !== undefined) {
      return this.#schedule(outcome.resumePendingUntil - Date.now());
    }
    for (let key of outcome.resolvedKeys) this.#decisions.delete(key);
    for (let [key, decision] of outcome.newDecisions) this.#decisions.set(key, decision);
    this.#cursor = outcome.lastSequence;

    let text = outcome.lines.join("\n");
    if (text.length > MAX_REPLY_CHARS) text = `…${text.slice(-MAX_REPLY_CHARS)}`;
    if (state.blockedReason && (text || this.#ask)) {
      text += `${text ? "\n" : ""}The agent waits for the user to resolve this in the chat ` +
          `(${state.blockedReason}); you will be told when it continues.`;
    }
    if (this.#ask) {
      let { callId } = this.#ask;
      this.#ask = null;
      this.deps.answer(callId, text || "The agent finished without a reply; the chat may show what happened.");
      this.deps.changed();
    } else if (text) {
      this.deps.report(`Update from the workspace agent in this chat:\n${text}`);
    }
  }
}

/**
 * What the voice model should hear about `messages`: how the `decisions` it was told about were
 * resolved, then what is new after `cursor`. Sets `resolvedSeenAt` on resolved decisions whose
 * resume has not started yet.
 */
export function describeOutcome(messages: AiChatMessage[], cursor: number,
                                decisions: Map<string, RelayDecision>, now: number): RelayOutcome {
  let lines: string[] = [];
  let resolvedKeys: string[] = [];
  let newDecisions = new Map<string, RelayDecision>();
  let resumed = messages.some((msg) => msg.sequence > cursor &&
      (msg.type === "agentNudge" || (msg.type === "message" && msg.author.type === "agent")));
  let resumePendingUntil: number | undefined;

  for (let [key, decision] of decisions) {
    let msg = messages.find((candidate) => decisionKey(candidate) === key);
    let resolved = msg && resolution(msg);
    if (!msg || !resolved) continue;
    if (decision.awaits && resolved.resumes && !resumed) {
      decision.resolvedSeenAt ??= now;
      if (now - decision.resolvedSeenAt < RESUME_GRACE_MS) {
        let until = decision.resolvedSeenAt + RESUME_GRACE_MS;
        resumePendingUntil = Math.min(resumePendingUntil ?? until, until);
      }
    }
    lines.push(resolved.line);
    resolvedKeys.push(key);
  }
  if (resumePendingUntil !== undefined) {
    return { lines: [], resumePendingUntil, newDecisions, resolvedKeys: [], lastSequence: cursor };
  }

  let lastSequence = cursor;
  for (let msg of messages) {
    if (msg.sequence <= cursor) continue;
    lastSequence = Math.max(lastSequence, msg.sequence);
    let line = newMessageLine(msg);
    if (line) lines.push(line);
    let key = decisionKey(msg);
    if (key && !resolution(msg)) {
      newDecisions.set(key, {
        sequence: msg.sequence,
        awaits: msg.type === "connectionRequest" ||
            (msg.type === "action" && msg.actionLog?.type === "action" &&
             msg.actionLog.description.awaitDecision === true),
      });
    }
  }
  return { lines, newDecisions, resolvedKeys, lastSequence };
}

type AgentAction = Extract<ActionLogEntry, { type: "action" }>;

function decisionKey(msg: AiChatMessage): string | null {
  if (msg.type === "action" && msg.actionLog?.type === "action") return `action:${msg.actionId}`;
  if (msg.type === "connectionRequest") return `connection:${msg.requestId}`;
  return null;
}

// How a decision message was resolved, or null while it is pending.
function resolution(msg: AiChatMessage): { line: string; resumes: boolean } | null {
  if (msg.type === "action" && msg.actionLog?.type === "action") {
    let log = msg.actionLog;
    return log.state === "pending" ? null : { line: actionLine(log), resumes: log.state !== "rejected" };
  }
  if (msg.type === "connectionRequest") {
    return msg.state === "pending" ? null : { line: connectionLine(msg), resumes: msg.state === "accepted" };
  }
  return null;
}

function newMessageLine(msg: AiChatMessage): string | null {
  switch (msg.type) {
    case "message":
      return msg.author.type === "agent" && msg.message.trim() ? msg.message.trim() : null;
    case "action":
      return msg.actionLog?.type === "action" ? actionLine(msg.actionLog) : null;
    case "connectionRequest":
      return connectionLine(msg);
    case "error":
      return msg.code === "usage_limit"
        ? "The agent stopped: the usage limit is reached."
        : `The agent stopped with an error: ${msg.message} The user can press Retry in the chat.`;
    default:
      return null;
  }
}

function actionLine(log: AgentAction): string {
  let title = `«${log.description.title}»`;
  switch (log.state) {
    case "pending":
      return log.description.awaitDecision === true
        ? `Waiting for the user's approval in the chat: ${title}.`
        : `Staged for the user's approval: ${title}.`;
    case "approved":
      return log.autoApproved ? `Applied automatically: ${title}.` : `Applied: ${title}.`;
    case "rejected":
      return `The user rejected: ${title}.`;
    case "failed":
      return `Approved but failed, nothing was changed: ${title}. Error: ${log.error ?? "unknown"}`;
  }
}

function connectionLine(msg: Extract<AiChatMessage, { type: "connectionRequest" }>): string {
  switch (msg.state) {
    case "pending":
      return `Waiting for the user to connect ${msg.vendorName} in the chat: ${msg.reason}`;
    case "accepted":
      return `The user connected ${msg.vendorName}.`;
    case "denied":
      return `The user declined to connect ${msg.vendorName}.`;
  }
}

/** The recent conversation, for a voice model joining an existing chat. */
export function chatContext(messages: AiChatMessage[]): string | null {
  let lines = messages.flatMap((msg) => msg.type === "message" && msg.message.trim()
    ? [`${msg.author.type === "agent" ? "Agent" : "User"}: ${clip(msg.message.trim(), MAX_CONTEXT_MESSAGE_CHARS)}`]
    : []).slice(-CONTEXT_MESSAGES);
  return lines.length
    ? `The call joined an existing chat. Its latest messages, for context:\n${lines.join("\n")}`
    : null;
}

/** The request in an `ask_agent` call's JSON arguments, or null if there is none. */
export function parseAgentRequest(args: unknown): string | null {
  if (typeof args !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !("request" in parsed)) return null;
  return typeof parsed.request === "string" && parsed.request.trim() ? parsed.request.trim() : null;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
