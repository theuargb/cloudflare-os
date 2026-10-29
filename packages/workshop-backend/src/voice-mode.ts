// Voice mode's deployment gate (see AuthenticatedApi.startVoiceSession). Voice mode talks with an
// OpenAI realtime model whose sessions are minted through the deployment's AI Gateway, so it runs
// only where an admin turned it on and the gateway serves OpenAI.

import { readAdminConfig } from "./admin-config.js";
import { AiGatewayConfig, GatewayModels, getAiGatewayConfig } from "./ai-gateway.js";
import type { AdminConfig } from "./storage-schema/admin-settings-storage.js";

// The gateway that serves OpenAI, as the environment or an admin enabled it; null when there is
// none or its environment is unusable (the admin settings report that on their own).
function openAiGateway(env: Cloudflare.Env, config: AdminConfig): AiGatewayConfig | null {
  let gateway: AiGatewayConfig | null;
  try {
    gateway = getAiGatewayConfig(env);
  } catch {
    return null;
  }
  return gateway && new GatewayModels(gateway, config).providers.has("openai") ? gateway : null;
}

/** Whether the deployment's gateway can serve voice mode. */
export function voiceModeReady(env: Cloudflare.Env, config: AdminConfig): boolean {
  return openAiGateway(env, config) !== null;
}

/**
 * The deployment's gateway, once voice mode is on and ready. Read on every call, so that turning
 * the switch off stops new speech at once.
 */
export async function requireVoiceMode(env: Cloudflare.Env): Promise<AiGatewayConfig> {
  let config = await readAdminConfig(env);
  let gateway = config.voiceModeEnabled ? openAiGateway(env, config) : null;
  if (!gateway) throw new Error("Voice mode is turned off on this deployment.");
  return gateway;
}
