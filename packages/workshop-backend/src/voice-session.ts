// Voice-mode sessions (AuthenticatedApi.startVoiceSession). The user talks with an OpenAI realtime
// model over WebRTC straight from the browser; the model does no work itself but relays requests
// to the chat agent through its single function, which the client fulfils. This mints the
// session's ephemeral key through the deployment's AI Gateway, which applies its stored OpenAI
// key, and fixes the session's configuration so the browser cannot change model or instructions
// before connecting. Nothing is stored.

import { VOICE_AGENT_TOOL, type VoiceSessionGrant } from "@gadgets/workshop-shared/api";
import { bindingFetch } from "./ai-gateway.js";
import { createWorkshopLogger } from "./observability.js";
import { requireVoiceMode } from "./voice-mode.js";
import { VOICE_PERSONA } from "./voice-persona.js";

const logger = createWorkshopLogger("workshop.voice");

const REALTIME_MODEL = "gpt-realtime-2.1-mini";
const CAPTION_MODEL = "gpt-4o-mini-transcribe";

// Long enough to post the SDP offer; the key works only for that.
const CLIENT_SECRET_TTL_SECONDS = 60;

const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

const INSTRUCTIONS = `
${VOICE_PERSONA}

# How you work

The user talks to you hands-free.

You cannot see the user's data, files, apps or connected services, and you cannot do work yourself. The workspace agent can: for anything about the user's data, documents, gadgets, connected services or any task to carry out, call ${VOICE_AGENT_TOOL} with the request written as the user would type it in the chat: first person, in the user's language, complete and self-contained, with every detail they gave (for example «Який останній платіж у банку?», not «Користувач повідомляє… Перевір…»). Do not talk about the user in the third person and do not add instructions on how to answer. Never invent results or claim something was done before ${VOICE_AGENT_TOOL} says so.

While the agent works (it can take a minute or more), tell the user briefly that you are on it, then wait quietly; you may keep talking with them meanwhile. When the result comes, retell it in a few short, natural spoken sentences in the user's language. Never read tables, code, links, IDs or long lists aloud: give the gist and say the details are in the chat. If the result says the agent is waiting for the user to approve or set something up, tell them what is waiting and that they can resolve it in the chat.

The chat also moves on without you: the user approves or rejects actions on screen, an approved action can fail, the agent resumes after an approval or a Retry. You then get an "Update from the workspace agent" message: tell the user briefly what happened (what was applied, rejected or failed and why, and what the agent says now), without waiting to be asked. An action that "failed" changed nothing.

Handle greetings, small talk and clarifying questions yourself. Keep every reply brief and conversational.
`.trim();

const AGENT_TOOL = {
  type: "function",
  name: VOICE_AGENT_TOOL,
  description:
      "Ask the workspace agent, which has the user's data, tools and gadgets, to answer a question " +
      "or carry out a task. Returns the agent's answer; takes from seconds to minutes.",
  parameters: {
    type: "object",
    properties: {
      request: {
        type: "string",
        description:
            "The user's request in their own words, first person, in their language; complete " +
            "and self-contained.",
      },
    },
    required: ["request"],
  },
};

/** Start a voice-mode session for `userId` (see AuthenticatedApi.startVoiceSession). */
export async function startVoiceSession(
    env: Cloudflare.Env, userId: DurableObjectId, language: string): Promise<VoiceSessionGrant> {
  let gateway = await requireVoiceMode(env);
  if (!LANGUAGE_TAG.test(language)) throw new Error("Unsupported speech language.");
  let route = gateway.route("openai");
  let durableObjectId = userId.toString();
  let response = await (route.binding ? bindingFetch(route.binding) : fetch)(
      `${route.url}/openai/realtime/client_secrets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-aig-authorization": route.authorization,
          "cf-aig-metadata": JSON.stringify({ user: durableObjectId, source: "voice" }),
          // Stable and opaque: OpenAI ties abuse signals to the user without learning who it is.
          "OpenAI-Safety-Identifier": durableObjectId,
        },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: CLIENT_SECRET_TTL_SECONDS },
          session: {
            type: "realtime",
            model: REALTIME_MODEL,
            instructions: INSTRUCTIONS,
            audio: {
              input: {
                noise_reduction: { type: "near_field" },
                transcription: { model: CAPTION_MODEL, language: language.split("-")[0] },
                turn_detection: { type: "semantic_vad" },
              },
              output: { voice: "marin" },
            },
            tools: [AGENT_TOOL],
            tool_choice: "auto",
            reasoning: { effort: "low" },
          },
        }),
      });
  let body = await response.text();
  let clientSecret = response.ok ? parseClientSecret(body) : undefined;
  if (!clientSecret) {
    logger.error("voice session failed", {
      event: "voice.session.failed",
      durableObjectId,
      status: response.status,
      statusText: body.slice(0, 500),
    });
    throw new Error("Voice mode is unavailable right now.");
  }
  // The only record of who started what. Carries no content.
  logger.info("voice session started", {
    event: "voice.session", durableObjectId, modelId: REALTIME_MODEL,
  });
  return { clientSecret };
}

function parseClientSecret(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return undefined;
  return typeof parsed.value === "string" && parsed.value ? parsed.value : undefined;
}
