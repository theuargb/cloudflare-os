import { describe, expect, it } from "vitest";
import { ModelRunner } from "../src/model-runner";
import type { ExtractRequest } from "@gadgets/workshop-shared/model-runner";

const request: ExtractRequest = {
  modelId: "@cf/cloudflare/clairic", state: "Invoice", fields: { title: { type: "text" } },
  initiator: { actorId: "human" },
};

describe("ModelRunner extraction input", () => {
  it.each([
    { modelId: " " }, { initiator: { actorId: " " } }, { fields: {} },
    { fields: { "invalid name": { type: "text" as const } } }, { state: " " },
    { images: Array.from({ length: 5 }, () => ({ contentType: "image/png", base64: "abc" })) },
  ])("rejects invalid input before resolving providers", async change => {
    await expect(ModelRunner.prototype.extract.call({} as ModelRunner, { ...request, ...change }))
      .rejects.toMatchObject({ code: "AI_INPUT_REJECTED" });
  });
});
