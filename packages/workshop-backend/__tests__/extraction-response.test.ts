import { describe, expect, it, vi } from "vitest";
import { decodeExtractionResponse } from "../src/extraction-response";

const fields = { title: { type: "text" as const }, estimate: { type: "estimate" as const }, tags: { type: "list" as const } };
const response = {
  model: "clairic", truncated: false,
  answers: {
    title: { type: "text", value: "Invoice", guess: "Invoice", confidence: 0.99, p_null: 0.01, span: [0, 7] },
    estimate: { type: "estimate", value: 10, mean: 10, median: 9, p10: 5, p90: 15 },
    tags: { type: "list", value: ["Invoice"], spans: [[0, 7]] },
  },
  usage: { state_tokens: 10, image_tokens: 0, schema_tokens: 20, input_tokens: 30, output_tokens: 5, passes: 1 },
};

describe("Clairic extraction response", () => {
  it.each([response, { success: true, result: response }, { state: "Completed", result: response }])(
    "accepts documented responses and Workers AI envelopes", raw => {
      const result = decodeExtractionResponse(raw, fields);
      expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 5 });
      expect(result.answers.title.pNull).toBe(0.01);
      expect(result.answers.title.span).toEqual([0, 7]);
      expect(result.answers.estimate.confidence).toBeUndefined();
      expect(result.answers.tags.spans).toEqual([[0, 7]]);
    });

  it("rejects missing answers", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => decodeExtractionResponse({ ...response, answers: {} }, fields))
        .toThrow("The AI extraction response was malformed");
    } finally { log.mockRestore(); }
  });
});
