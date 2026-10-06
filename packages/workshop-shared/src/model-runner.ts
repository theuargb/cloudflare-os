// The contract of the ModelRunner service entrypoint (workshop-backend/src/model-runner.ts): a
// private service binding through which another worker, e.g. a business-process platform, runs the
// deployment's AI models for a human initiator. The Workshop admin decides which models exist; this
// file holds only the request and response shapes and the decision-model catalog.

/** The kind of an AI model: generative (chat/text) or decision (structured evaluation). */
export type AiModelKind = "generative" | "decision";

/** Input a model accepts: `multimodal` takes images and PDF files next to text. */
export type ModelInput = "text" | "multimodal";

/**
 * Workers AI structured-evaluation models by provider; enabled with the provider. A decision
 * model evaluates one state against typed Noul / Choice / Score questions and returns calibrated
 * answers with probabilities — it never generates free text. Only models with a documented
 * Workers AI model id belong here (catalog: https://developers.cloudflare.com/ai/models/).
 */
export const DECISION_MODELS: Record<string, Record<string, { name: string; input: ModelInput }>> = {
  "cloudflare": {
    // https://developers.cloudflare.com/ai/models/typesafe/jev/ — text-only.
    "typesafe/jev": { name: "TypeSafe Jev", input: "text" },
    // https://developers.cloudflare.com/workers-ai/models/clef/ and …/clef-flash/ — same
    // state/questions → answers contract as Jev. The models accept images, but `decide` sends a
    // text/JSON state only, so the catalog lists them as text.
    "@cf/cloudflare/clef": { name: "Cloudflare Clef", input: "text" },
    "@cf/cloudflare/clef-flash": { name: "Cloudflare Clef Flash", input: "text" },
  },
};

/**
 * One typed question a decision model answers against a `DecisionState`. `noul` is a yes/no
 * judgement (the answer's `noul` is the probability it is yes), `choice` picks one of
 * `criteria`'s keys, and `score` places the state on the ordered scale `criteria`.
 */
export type DecisionQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

/**
 * The model's calibrated answer to one `DecisionQuestion`, keyed by question id in a decide()
 * result. `confidence` is the model's self-reported calibration (0..1); `probabilities` spread
 * the same mass across every offered option.
 */
export type DecisionAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> };

/**
 * The material a decision model evaluates: a free-form string, a structured object, or an array.
 * Never contains instructions — those live in the questions.
 */
export type DecisionState = string | Record<string, unknown> | unknown[];

/** The human on whose behalf a model request runs; attributed in the gateway's logs and metadata. */
export type ModelInitiator = { actorId: string; organizationId?: string };

/** Token counts of one model request. */
export type ModelUsage = { inputTokens: number; outputTokens: number };

/**
 * One model the runner offers. Labels contain no provider credentials. `hidden` marks a gateway
 * model the deployment keeps out of the Workshop's model pickers: it still runs, so settings may
 * select it for machine tasks.
 */
export type RunnerModel = { id: string; label: string; kind: AiModelKind; input?: ModelInput; hidden?: true };

/** A request to `ModelRunner.run`: multimodal messages with optional structured output. */
export type ModelRunRequest = {
  modelId: string;
  system?: string;
  messages: Array<{
    role: "user" | "assistant";
    parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mime: string; bytes: Uint8Array }
    >;
  }>;
  /** JSON schema the answer must match; the parsed answer is returned as `json`. */
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  initiator: ModelInitiator;
};

/** The result of `ModelRunner.run`; `json` is absent when no schema was given or it did not parse. */
export type ModelRunResult = { text: string; json?: unknown; usage: ModelUsage };

/** A request to `ModelRunner.decide`: evaluate one state against typed questions. */
export type DecideRequest = {
  modelId: string;
  state: DecisionState;
  questions: Record<string, DecisionQuestion>;
  initiator: ModelInitiator;
};

/** The result of `ModelRunner.decide`: one calibrated answer per question id. */
export type DecideResult = {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage: ModelUsage;
};

/** A document for `ModelRunner.toMarkdown`. */
export type ToMarkdownRequest = { name: string; mime: string; bytes: Uint8Array };

/** The Markdown conversion of a document. */
export type ToMarkdownResult = { markdown: string };
