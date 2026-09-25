import { describe, expect, it } from "vitest";
import { OneCAiModelRunner } from "../src/server.js";

describe("OneCAiModelRunner catalog", () => {
  it("exposes labels only for models enabled in this deployment gateway", async () => {
    const env = {
      CF_AI_GATEWAY: "deployment-gateway",
      CF_AI_GATEWAY_ACCOUNT_ID: "account",
      CF_AI_GATEWAY_API_TOKEN: "secret-token",
      CF_AI_GATEWAY_PROVIDERS: "anthropic",
    } as Cloudflare.Env;
    const runner = new OneCAiModelRunner({} as never, env);

    const models = await runner.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContainEqual({ id: "claude-sonnet-5", label: "Claude Sonnet 5" });
    expect(models.some((model) => model.id.startsWith("gpt-") || model.id.startsWith("@cf/"))).toBe(false);
    expect(JSON.stringify(models)).not.toContain("secret-token");
  });

  it("fails with a stable error when AI Gateway is not configured", async () => {
    const runner = new OneCAiModelRunner({} as never, {} as Cloudflare.Env);
    await expect(runner.listModels()).rejects.toThrow("AI model catalog is unavailable");
  });
});
