import type { DecisionAnswer, DecisionQuestion } from "@gadgets/workshop-shared/model-runner";

/**
 * A JEV model result, normalized for the model-runner RPC contract.
 *
 * @see https://developers.cloudflare.com/ai/models/typesafe/jev/
 */
export type JevDecisionResult = {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage: { inputTokens: number; outputTokens: number };
};

/**
 * Decode a JEV response, accepting either the documented bare `{ model, answers, usage }`
 * result or a completed `{ state: "Completed", result }` envelope.
 */
export function decodeJevResponse(
    raw: unknown, questions: Record<string, DecisionQuestion>): JevDecisionResult {
  const record = objectRecord(raw);
  if (record && Object.hasOwn(record, "state")) {
    if (record.state !== "Completed") reject(`state ${String(record.state)}`, raw);
    return decodeBareResult(record.result, questions, raw);
  }
  return decodeBareResult(record, questions, raw);
}

function decodeBareResult(
    result: unknown, questions: Record<string, DecisionQuestion>, raw: unknown): JevDecisionResult {
  const resultRecord = objectRecord(result);
  const model = resultRecord?.model;
  const answers = resultRecord && objectRecord(resultRecord.answers);
  const usage = resultRecord && objectRecord(resultRecord.usage);
  if (typeof model !== "string" || !model.length) reject("missing model", raw);
  if (!answers) reject("missing answers", raw);
  if (!usage) reject("missing usage", raw);

  const questionIds = Object.keys(questions);
  const answerIds = Object.keys(answers);
  if (answerIds.length !== questionIds.length) {
    reject(`answer count ${answerIds.length} ≠ question count ${questionIds.length}`, raw);
  }
  for (const id of questionIds) {
    if (!Object.hasOwn(answers, id)) reject(`no answer for question ${id}`, raw);
    if (!matchesQuestion(answers[id], questions[id])) {
      reject(`answer for ${id} does not match ${questions[id].type}`, raw);
    }
  }

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
      typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    reject("invalid token usage", raw);
  }

  return {
    model,
    answers: answers as Record<string, DecisionAnswer>,
    usage: { inputTokens, outputTokens },
  };
}

function matchesQuestion(answer: unknown, question: DecisionQuestion): answer is DecisionAnswer {
  const value = objectRecord(answer);
  if (!value) return false;

  switch (question.type) {
    case "noul":
      return value.type === "noul" && probability(value.noul);
    case "choice":
      return value.type === "choice" && typeof value.choice === "string" && value.choice.length > 0 &&
          Object.hasOwn(question.criteria, value.choice) && probability(value.confidence) &&
          probabilityMap(value.probabilities, Object.keys(question.criteria));
    case "score": {
      const keys = question.criteria.map((_, index) => String(index));
      return value.type === "score" && typeof value.score === "number" &&
          Number.isFinite(value.score) && value.score >= 0 && value.score <= question.criteria.length - 1 &&
          probability(value.confidence) && probabilityMap(value.probabilities, keys) &&
          legend(value.legend, question.criteria);
    }
  }
}

function probabilityMap(value: unknown, expectedKeys: string[]): boolean {
  const probabilities = objectRecord(value);
  return !!probabilities && hasExactKeys(probabilities, expectedKeys) &&
      Object.values(probabilities).every(probability);
}

function legend(value: unknown, criteria: string[]): boolean {
  const labels = objectRecord(value);
  return !!labels && hasExactKeys(labels, criteria.map((_, index) => String(index))) &&
      criteria.every((criterion, index) => labels[String(index)] === criterion);
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: string[]): boolean {
  return Object.keys(record).length === expectedKeys.length &&
      expectedKeys.every((key) => Object.hasOwn(record, key));
}

function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
}

function malformed(reason: string): Error & { code: "AI_UNAVAILABLE" } {
  return Object.assign(new Error(`The AI decision response was malformed: ${reason}.`),
    { code: "AI_UNAVAILABLE" as const });
}

function reject(reason: string, raw: unknown): never {
  console.error("JEV decision response rejected:", reason, JSON.stringify(raw)?.slice(0, 2000));
  throw malformed(reason);
}
