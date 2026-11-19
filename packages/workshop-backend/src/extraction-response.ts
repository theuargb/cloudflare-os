import type { ExtractResult, ExtractionAnswer, ExtractionField } from "@gadgets/workshop-shared/model-runner";
import { unwrapWorkersAiResult } from "./jev-response.js";

/** Decode the documented Clairic response, including Workers AI envelopes. */
export function decodeExtractionResponse(raw: unknown, fields: Record<string, ExtractionField>): ExtractResult {
  const result = record(unwrapWorkersAiResult(raw));
  const answers = record(result?.answers);
  const usage = record(result?.usage);
  if (typeof result?.model !== "string") reject("missing model", raw);
  if (!answers) reject("missing answers", raw);
  if (typeof result.truncated !== "boolean") reject("missing truncated", raw);
  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  if (!tokenCount(inputTokens) || !tokenCount(outputTokens)) reject("invalid token usage", raw);
  const decoded: Record<string, ExtractionAnswer> = {};
  for (const name of Object.keys(fields)) {
    const answer = Object.hasOwn(answers, name) ? record(answers[name]) : undefined;
    if (!answer || typeof answer.type !== "string" || !Object.hasOwn(answer, "value")) {
      reject(`missing or invalid answer for ${name}`, raw);
    }
    decoded[name] = {
      type: answer.type, value: answer.value,
      ...(Object.hasOwn(answer, "guess") && { guess: answer.guess }),
      ...(typeof answer.p_null === "number" && { pNull: answer.p_null }),
      ...(typeof answer.confidence === "number" && { confidence: answer.confidence }),
      ...(span(answer.span) && { span: answer.span }),
      ...(Array.isArray(answer.spans) && answer.spans.every(span) && { spans: answer.spans }),
      ...(Object.hasOwn(answer, "median") && { median: answer.median }),
      ...(Object.hasOwn(answer, "p10") && { p10: answer.p10 }),
      ...(Object.hasOwn(answer, "p90") && { p90: answer.p90 }),
    };
  }
  return { model: result.model, answers: decoded, truncated: result.truncated,
    usage: { inputTokens, outputTokens } };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function tokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function span(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isInteger);
}

function reject(reason: string, raw: unknown): never {
  console.error("Clairic extraction response rejected:", reason, JSON.stringify(raw)?.slice(0, 2000));
  throw Object.assign(new Error(`The AI extraction response was malformed: ${reason}.`),
    { code: "AI_UNAVAILABLE" as const });
}
