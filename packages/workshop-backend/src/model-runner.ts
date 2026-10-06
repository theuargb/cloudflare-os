import { WorkerEntrypoint } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type { Message } from "@earendil-works/pi-ai";
import {
  DECISION_MODELS, type DecideRequest, type DecideResult, type DecisionQuestion,
  type DecisionState, type ModelRunRequest, type ModelRunResult, type RunnerModel,
  type ToMarkdownRequest, type ToMarkdownResult,
} from "@gadgets/workshop-shared/model-runner";
import type { AiChatAuthorInfo } from "@gadgets/workshop-shared/api";
import { getAiGatewayConfig, getGatewayModels, type AiGatewayConfig, type GatewayModels } from "./ai-gateway.js";
import { getModel } from "./ai-models.js";
import { decodeJevResponse } from "./jev-response.js";
import { createWorkshopLogger } from "./observability";

const logger = createWorkshopLogger("workshop.model-runner");

/** Attribution for the model handles built only to read a model's capabilities. */
const LIST_INITIATOR: AiChatAuthorInfo = { type: "agent", id: "model-runner", name: "Model runner" };

type AiErrorCode = "AI_UNAVAILABLE" | "AI_LIMIT" | "AI_INPUT_REJECTED";

/** An error carrying the stable `.code` that ModelRunner callers branch on. */
function aiError(code: AiErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Private service binding for Platform Foundation's bounded, deployment-configured AI requests. */
@validateRpc()
export class ModelRunner extends WorkerEntrypoint<Cloudflare.Env> {
  /** The deployment's AI Gateway models, or an AI_UNAVAILABLE error when there are none to offer. */
  async #models(): Promise<GatewayModels> {
    let models: GatewayModels | null;
    try {
      models = await getGatewayModels(this.env);
    } catch (error) {
      logger.error("failed to read the AI model table", {
        event: "model-runner.models.failed", error,
      });
      throw aiError("AI_UNAVAILABLE", "AI Gateway is unavailable.");
    }
    if (!models) throw aiError("AI_UNAVAILABLE", "AI Gateway is unavailable.");
    return models;
  }

  /**
   * List deployment-enabled and hidden AI Gateway models (hidden ones flagged), generative and
   * decision; labels contain no provider credentials. A generative model is `multimodal` when the
   * Workshop's own runtime view of it accepts images.
   */
  async listModels(): Promise<RunnerModel[]> {
    let models: GatewayModels | null;
    try {
      models = await getGatewayModels(this.env);
    } catch {
      models = null;
    }
    if (!models) throw new Error("The AI model catalog is unavailable.");

    let result: RunnerModel[] = [];
    for (let { id, name, mode } of models.all) {
      if (mode !== "enabled" && mode !== "hidden") continue;
      try {
        let { model } = getModel(this.env, models.runConfig(id)!, LIST_INITIATOR);
        result.push({
          id, label: name, kind: "generative",
          input: model.input.includes("image") ? "multimodal" : "text",
          ...(mode === "hidden" && { hidden: true as const }),
        });
      } catch {
        // A model the Workshop itself cannot run is not offered.
      }
    }
    for (let [provider, catalog] of Object.entries(DECISION_MODELS)) {
      if (!models.providers.has(provider)) continue;
      for (let [id, { name, input }] of Object.entries(catalog)) {
        result.push({ id, label: name, kind: "decision", input });
      }
    }
    return result;
  }

  /**
   * Run a decision model: evaluate one `state` against typed questions and return calibrated
   * answers. Runs the Workers AI model through the gateway (binding transport when available,
   * else HTTPS with the API token). Errors carry stable `.code`: AI_UNAVAILABLE, AI_LIMIT,
   * AI_INPUT_REJECTED — like `run`.
   */
  async decide(req: DecideRequest): Promise<DecideResult> {
    const questionCount = req?.questions ? Object.keys(req.questions).length : 0;
    if (!req?.modelId?.trim() || !questionCount || questionCount > 64 ||
        !req.initiator?.actorId?.trim()) {
      throw aiError("AI_INPUT_REJECTED", "Invalid AI decision request.");
    }

    let models = await this.#models();
    let configured = Object.entries(DECISION_MODELS).some(([provider, catalog]) =>
        models.providers.has(provider) && Object.hasOwn(catalog, req.modelId));
    if (!configured) {
      throw aiError("AI_UNAVAILABLE", "The requested decision model is unavailable.");
    }

    const metadata = { tool: "decide", automated: true, actor: req.initiator.actorId };
    const input = { state: req.state, questions: req.questions };
    const binding = models.gateway.bindingFor("cloudflare");
    let raw: unknown;
    try {
      raw = binding
          ? await binding.run(req.modelId, input, { gateway: { id: models.gateway.gateway, metadata } })
          : await runDecisionModelOverHttps(models.gateway, req.modelId, input, metadata);
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      throw aiError("AI_UNAVAILABLE", "The AI decision request failed.");
    }
    return decodeJevResponse(raw, req.questions);
  }

  /**
   * Convert a document (PDF text layer, DOCX, XLSX, HTML, images, ...) to Markdown via the
   * Workers AI binding's toMarkdown conversion, giving text-only decision models a state for
   * files. Requires the WORKERS_AI binding; without it the call fails with AI_UNAVAILABLE.
   */
  async toMarkdown(req: ToMarkdownRequest): Promise<ToMarkdownResult> {
    if (!req?.name?.trim() || !req.mime || !req.bytes?.length) {
      throw aiError("AI_INPUT_REJECTED", "Invalid document for Markdown conversion.");
    }
    const binding = this.env.WORKERS_AI;
    if (!binding) throw aiError("AI_UNAVAILABLE", "The Workers AI binding is unavailable.");
    let result: ConversionResponse;
    try {
      const gateway = getAiGatewayConfig(this.env);
      const options = gateway?.sameAccountGateway
          ? { gateway: {
              id: gateway.sameAccountGateway,
              metadata: { tool: "toMarkdown", automated: true },
            } }
          : undefined;
      result = await binding.toMarkdown(
        { name: req.name, blob: new Blob([req.bytes], { type: req.mime }) }, options);
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      throw aiError("AI_UNAVAILABLE", "Markdown conversion failed.");
    }
    if (result.format === "error") throw aiError("AI_UNAVAILABLE", "Markdown conversion failed.");
    return { markdown: result.data };
  }

  /**
   * Run a model request with multimodal messages, optional structured output, and real initiator
   * attribution. Errors carry stable `.code`: AI_UNAVAILABLE, AI_LIMIT, AI_INPUT_REJECTED.
   */
  async run(req: ModelRunRequest): Promise<ModelRunResult> {
    if (!req?.modelId?.trim() || !req.messages?.length || !req.initiator?.actorId?.trim()) {
      throw aiError("AI_INPUT_REJECTED", "Invalid AI request.");
    }

    let configured = (await this.#models()).resolve(req.modelId);
    if (!configured) throw aiError("AI_UNAVAILABLE", "The requested AI model is unavailable.");

    // Build system prompt; inject JSON schema instruction when no native structured output
    let systemPrompt = req.system ?? "";
    if (req.responseSchema) {
      const instruction = "\n\nYou MUST respond with valid JSON matching this schema:\n" +
        JSON.stringify(req.responseSchema) +
        "\nReturn ONLY the JSON object, no markdown fences or other text.";
      systemPrompt = systemPrompt ? systemPrompt + instruction : instruction.trimStart();
    }

    // Convert messages to pi-ai format (ImageContent carries files incl. PDFs)
    const piMessages: Message[] = req.messages.map((msg) => {
      const parts: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      for (const part of msg.parts) {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text });
        } else {
          const b64 = part.bytes instanceof Uint8Array
            ? Buffer.from(part.bytes).toString("base64")
            : String(part.bytes);
          parts.push({ type: "image", data: b64, mimeType: part.mime });
        }
      }
      const content = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
      return { role: msg.role, content, timestamp: Date.now() } as Message;
    });

    try {
      const handle = getModel(this.env, configured.config, {
        type: "agent",
        id: req.initiator.actorId,
        name: req.initiator.actorId,
      }, { metadata: { source: "model-binding" } });

      const stream = await handle.stream(handle.model, {
        systemPrompt: systemPrompt || undefined,
        messages: piMessages,
      }, {
        maxTokens: req.maxOutputTokens,
        thinking: false,
      });

      const message = await stream.result();
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        const status = handle.lastResponse?.status;
        if (status === 429) throw aiError("AI_LIMIT", "AI rate limit exceeded.");
        if (status && status >= 400 && status < 500) throw aiError("AI_INPUT_REJECTED", "AI input rejected.");
        throw aiError("AI_UNAVAILABLE", "The AI request failed.");
      }

      const text = message.content
        .filter((block): block is { type: "text"; text: string } =>
          typeof block === "object" && "type" in block && block.type === "text")
        .map((block) => block.text)
        .join("");

      // pi Usage: { input, output, cacheRead, cacheWrite, totalTokens, cost }
      const usage = {
        inputTokens: message.usage?.input ?? 0,
        outputTokens: message.usage?.output ?? 0,
      };

      let json: unknown;
      if (req.responseSchema) {
        try {
          const trimmed = text.trim();
          const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
          json = JSON.parse(fenced ? fenced[1] : trimmed);
        } catch { /* json stays undefined — caller handles missing structured output */ }
      }

      return { text, json, usage };
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      throw aiError("AI_UNAVAILABLE", "The AI request failed.");
    }
  }
}

/**
 * Run a decision model over JEV's documented HTTPS request shape:
 * https://developers.cloudflare.com/ai/models/typesafe/jev/. The endpoint returns Cloudflare's
 * `{ success, result }` REST envelope, documented at
 * https://developers.cloudflare.com/workers-ai/get-started/rest-api/; unwrap its outer envelope
 * before passing the result to the shared decoder, which accepts both bare and completed JEV
 * response shapes. The `cf-aig-gateway-id` header routes through the configured gateway and
 * `cf-aig-metadata` carries attribution. The token is guaranteed by the AiGatewayConfig
 * constructor whenever the binding transport is unavailable.
 */
async function runDecisionModelOverHttps(
    gateway: AiGatewayConfig,
    modelId: string,
    input: { state: DecisionState; questions: Record<string, DecisionQuestion> },
    metadata: { tool: string; automated: boolean; actor: string },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
        "https://api.cloudflare.com/client/v4/accounts/" +
        `${encodeURIComponent(gateway.accountId)}/ai/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gateway.apiToken!}`,
        "cf-aig-gateway-id": gateway.gateway,
        "cf-aig-metadata": JSON.stringify(metadata),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: modelId, input }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw aiError("AI_UNAVAILABLE", "The AI decision request failed.");
  }
  if (!response.ok) {
    if (response.status === 429) throw aiError("AI_LIMIT", "AI rate limit exceeded.");
    if (response.status >= 400 && response.status < 500) {
      throw aiError("AI_INPUT_REJECTED", "AI decision input rejected.");
    }
    throw aiError("AI_UNAVAILABLE", "The AI decision request failed.");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw aiError("AI_UNAVAILABLE", "The AI decision request failed.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      !("success" in body) || body.success !== true || !("result" in body)) {
    throw aiError("AI_UNAVAILABLE",
      "The AI decision response was malformed: REST envelope without success/result.");
  }
  return body.result;
}
