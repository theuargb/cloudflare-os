import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import type { ObserverConfigCallback, ObserverBindingNeed, ObserverAccountChoice } from "@gadgets/workshop-shared/api";
import { openAgentSession } from "../src/agent-session.js";
import {
  ADMIN_USERNAME, startTestGatekeeperHarness, TEST_GATEKEEPER_WORKER, TEST_VENDOR_ID, type Harness,
} from "../src/harness.js";
import {
  scriptedChatCompletions, SCRIPTED_MODEL_CONFIG, SCRIPTED_MODEL_ID,
  SCRIPTED_MODEL_PROFILE,
} from "../src/mock-model.js";
import { NetworkInterceptor } from "../src/network-interceptor.js";
import {
  accountLabel, connect, listConnectedAccounts, nextUsernames, signUp, stubFor, RpcTarget, waitFor,
} from "../src/rpc-client.js";

let harness: Harness;
const ACTOR_CONTEXT_MODEL_ID = "test-actor-context-model";
const ACTOR_CONTEXT_MODEL_PROFILE = {
  type: "agent" as const, id: ACTOR_CONTEXT_MODEL_ID, name: "Actor Context Test Model",
};
const ACTOR_CONTEXT_MODEL_CONFIG = { ...SCRIPTED_MODEL_CONFIG, model: ACTOR_CONTEXT_MODEL_ID };
const STALE_MODEL_ID = "test-stale-agent-model";
const STALE_MODEL_PROFILE = { type: "agent" as const, id: STALE_MODEL_ID, name: "Stale Agent Test Model" };
const STALE_MODEL_CONFIG = { ...SCRIPTED_MODEL_CONFIG, model: STALE_MODEL_ID };
const actorContextModel = scriptedChatCompletions([
  {
    toolCall: {
      id: "read-agent-context-owner",
      name: "executeCode",
      arguments: {
        code: "export default async function(self, env) { console.log(await env.TEST_AMBIENT.getAgentContext()); }",
      },
    },
  },
  { text: "Context recorded." },
  {
    toolCall: {
      id: "read-agent-context-admin",
      name: "executeCode",
      arguments: {
        code: "export default async function(self, env) { console.log(await env.TEST_AMBIENT.getAgentContext()); }",
      },
    },
  },
  { text: "Context recorded." },
]);
const staleAgentModel = scriptedChatCompletions([
  {
    toolCall: {
      id: "capture-agent-queue",
      name: "executeCode",
      arguments: {
        code: "export default async function(self, env) { console.log(await env.TEST_AMBIENT.captureQueueForStaleSubmit()); }",
      },
    },
  },
  { text: "Queue captured." },
]);
const model = scriptedChatCompletions([
  {
    toolCall: {
      id: "write-test-value",
      name: "executeCode",
      arguments: {
        code: "export default async function(self, env) { console.log(await env.TEST_AMBIENT.writeValues([7, 8])); }",
      },
    },
  },
  { text: "The test value was updated." },
]);
const network = new NetworkInterceptor({ handlers: [async (url, method, headers, request) => {
  if (method !== "POST" || !url.pathname.endsWith("/chat/completions")) return null;
  const body = await request.clone().json() as {model?: string};
  if (body.model === ACTOR_CONTEXT_MODEL_ID) {
    return actorContextModel.handler(url, method, headers, request);
  }
  if (body.model === STALE_MODEL_ID) return staleAgentModel.handler(url, method, headers, request);
  return model.handler(url, method, headers, request);
}] });

beforeAll(async () => {
  network.install();
  harness = await startTestGatekeeperHarness({ enableGadgetExecution: true });
});

afterAll(async () => {
  try {
    await harness?.server.close();
    expect(network.getUnmockedCalls()).toEqual([]);
  } finally {
    network.uninstall();
  }
});

const TEST_ACTION_STATE = z.object({
  pending: z.array(z.object({ id: z.number(), value: z.number() })),
  value: z.number().optional(),
  applyCount: z.number(),
});
type TestActionState = z.infer<typeof TEST_ACTION_STATE>;

async function actionState(label: string): Promise<TestActionState> {
  const response = await harness.fetchWorker(
      TEST_GATEKEEPER_WORKER, "http://gatekeeper-test.test/control/action-state",
      { method: "POST", body: JSON.stringify({ label }) });
  if (response.status !== 200) {
    throw new Error(`Reading test action state failed with ${response.status}: ${await response.text()}`);
  }
  return TEST_ACTION_STATE.parse(await response.json());
}

async function recordedAgentContext(label: string) {
  const response = await harness.fetchWorker(
      TEST_GATEKEEPER_WORKER, "http://gatekeeper-test.test/control/agent-context",
      { method: "POST", body: JSON.stringify({ label }) });
  if (response.status !== 200) {
    throw new Error(`Reading test actor context failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json() as {actorId: string; actor: {displayName: string}; isAdmin: boolean} | null;
}

it("uses deployment ADMINS policy for owner and collaborator agent contexts", async () => {
  const [ownerName] = nextUsernames("nonadminowner");
  if (!ownerName) throw new Error("Failed to allocate owner username");
  using ownerPublic = connect(harness.url);
  using ownerApi = await signUp(ownerPublic, ownerName);
  await ownerApi.addModel(ACTOR_CONTEXT_MODEL_PROFILE, ACTOR_CONTEXT_MODEL_CONFIG);
  await ownerApi.setQuickModel(null);
  await ownerApi.setPreferredModel(ACTOR_CONTEXT_MODEL_ID);
  await ownerApi.completeOnboarding();
  await ownerApi.provisionAmbientAccount(TEST_VENDOR_ID);
  const ownerAccount = await waitFor("the owner test gatekeeper account", async () =>
    (await listConnectedAccounts(ownerApi)).find(entry => entry.vendorId === TEST_VENDOR_ID) ?? null);
  const ownerLabel = accountLabel(ownerAccount);
  using ownerWorkspace = await ownerApi.newGadget();
  const { id: workspaceId } = await ownerWorkspace.getMetadata();
  const ownerChatId = await ownerWorkspace.newChat("Check the actor context.", ACTOR_CONTEXT_MODEL_ID);
  const ownerContext = await waitFor("the owner agent context", async () =>
    await recordedAgentContext(ownerLabel));
  expect(ownerContext).toMatchObject({ actorId: ownerName, isAdmin: false });
  await waitFor("the owner agent turn to finish", async () => {
    const history = await ownerWorkspace.getChatHistory(ownerChatId);
    return history.messages.some(entry => entry.type === "message" && entry.author.type === "agent")
      ? history : null;
  });

  using adminPublic = connect(harness.url);
  using adminApi = await signUp(adminPublic, ADMIN_USERNAME);
  await adminApi.addModel(ACTOR_CONTEXT_MODEL_PROFILE, ACTOR_CONTEXT_MODEL_CONFIG);
  await adminApi.setQuickModel(null);
  await adminApi.setPreferredModel(ACTOR_CONTEXT_MODEL_ID);
  await adminApi.completeOnboarding();
  await adminApi.provisionAmbientAccount(TEST_VENDOR_ID);
  const adminAccount = await waitFor("the admin test gatekeeper account", async () =>
    (await listConnectedAccounts(adminApi)).find(entry => entry.vendorId === TEST_VENDOR_ID) ?? null);
  await ownerWorkspace.addCollaborator(ADMIN_USERNAME, "build");
  class AdminObserverConfig extends RpcTarget implements ObserverConfigCallback {
    async configure(needs: ObserverBindingNeed[]): Promise<ObserverAccountChoice[]> {
      return needs.map(need => ({ gatekeeperId: need.gatekeeperId, accountId: adminAccount.id }));
    }
  }
  using adminWorkspace = await adminApi.openGadget(
      workspaceId, undefined, stubFor(new AdminObserverConfig()));
  await harness.fetchWorker(TEST_GATEKEEPER_WORKER, "http://gatekeeper-test.test/control/clear-agent-context", {
    method: "POST", body: JSON.stringify({ label: ownerLabel }),
  });
  await adminWorkspace.newChat("Check the actor context.", ACTOR_CONTEXT_MODEL_ID);
  const adminContext = await waitFor("the collaborator admin agent context", async () =>
    await recordedAgentContext(ownerLabel));
  expect(adminContext).toMatchObject({ actorId: ADMIN_USERNAME, isAdmin: true });
});

it("rejects submission through an agent queue after its initiating session ends", async () => {
  await using session = await openAgentSession(harness.url, {
    modelId: STALE_MODEL_ID,
    userModel: { profile: STALE_MODEL_PROFILE, config: STALE_MODEL_CONFIG },
    ambientVendorIds: [TEST_VENDOR_ID],
    usernamePrefix: "stalefence",
  });
  const label = accountLabel(session.connectedAccount(TEST_VENDOR_ID));
  const turn = await session.runTurn("Capture the approval queue for a stale session test.");
  expect(turn.outcome).toEqual({ status: "completed" });
  expect(await recordedAgentContext(label)).toMatchObject({ actorId: session.username });
  expect((await session.listActions({ filter: "action" })).entries).toHaveLength(0);

  const probeUrl = "http://gatekeeper-test.test/control/stale-agent-probe";
  const release = await harness.fetchWorker(TEST_GATEKEEPER_WORKER, probeUrl, {
    method: "POST", body: JSON.stringify({ label, command: "release" }),
  });
  expect(release.status).toBe(204);
  const result = await waitFor("the stale agent queue probe", async () => {
    const response = await harness.fetchWorker(TEST_GATEKEEPER_WORKER, probeUrl, {
      method: "POST", body: JSON.stringify({ label, command: "result" }),
    });
    return await response.json() ?? null;
  });
  expect(result).toEqual({
    contextError: "The initiating agent session is no longer active.",
    submitError: "The initiating agent session is no longer active.",
  });
  expect((await session.listActions({ filter: "action" })).entries).toHaveLength(0);
});

it("attributes collaborator agent actions to the requester and rechecks access at approval", async () => {
  const [ownerName, collaboratorName] = nextUsernames("agentactionowner", "agentactioncollab");
  if (!ownerName || !collaboratorName) throw new Error("Failed to allocate test usernames");
  using ownerPublic = connect(harness.url);
  using ownerApi = await signUp(ownerPublic, ownerName);
  using collaboratorPublic = connect(harness.url);
  using collaboratorApi = await signUp(collaboratorPublic, collaboratorName);
  await ownerApi.addModel(SCRIPTED_MODEL_PROFILE, SCRIPTED_MODEL_CONFIG);
  await ownerApi.setQuickModel(null);
  await ownerApi.setPreferredModel(SCRIPTED_MODEL_ID);
  await ownerApi.completeOnboarding();
  await ownerApi.provisionAmbientAccount(TEST_VENDOR_ID);
  const ownerAccount = await waitFor("the test gatekeeper account", async () =>
    (await listConnectedAccounts(ownerApi)).find(entry => entry.vendorId === TEST_VENDOR_ID) ?? null);
  const label = accountLabel(ownerAccount);
  using ownerWorkspace = await ownerApi.newGadget();
  const { id: workspaceId } = await ownerWorkspace.getMetadata();
  await ownerWorkspace.addCollaborator(collaboratorName, "build");

  await collaboratorApi.addModel(SCRIPTED_MODEL_PROFILE, SCRIPTED_MODEL_CONFIG);
  await collaboratorApi.setQuickModel(null);
  await collaboratorApi.setPreferredModel(SCRIPTED_MODEL_ID);
  await collaboratorApi.completeOnboarding();
  await collaboratorApi.provisionAmbientAccount(TEST_VENDOR_ID);
  const collaboratorAccount = await waitFor("the collaborator test gatekeeper account", async () =>
    (await listConnectedAccounts(collaboratorApi))
      .find(entry => entry.vendorId === TEST_VENDOR_ID) ?? null);
  class ObserverConfig extends RpcTarget implements ObserverConfigCallback {
    async configure(needs: ObserverBindingNeed[]): Promise<ObserverAccountChoice[]> {
      return needs.map(need => ({ gatekeeperId: need.gatekeeperId, accountId: collaboratorAccount.id }));
    }
  }
  using collaboratorWorkspace = await collaboratorApi.openGadget(
      workspaceId, undefined, stubFor(new ObserverConfig()));
  await collaboratorWorkspace.newChat("Set the test values to 7 and 8.", SCRIPTED_MODEL_ID);

  const pending = await waitFor("two test actions to enter the approval queue", async () => {
    const entries = (await ownerWorkspace.listActions({ filter: "pending" })).entries;
    return entries.length === 2 ? entries : null;
  }).then(entries => entries.toSorted((a, b) => a.id - b.id));
  const [first, second] = pending;
  if (first === undefined || second === undefined) throw new Error("Expected two pending actions");
  expect(pending).toEqual([
    expect.objectContaining({
      type: "action",
      state: "pending",
      description: expect.objectContaining({ title: "Set the test value to 7", awaitDecision: true }),
    }),
    expect.objectContaining({
      type: "action",
      state: "pending",
      description: expect.objectContaining({ title: "Set the test value to 8", awaitDecision: true }),
    }),
  ]);
  expect(await actionState(label)).toEqual({
    pending: [{ id: 1, value: 7 }, { id: 2, value: 8 }],
    applyCount: 0,
  });
  expect(model.requests).toHaveLength(1);
  expect((await actionState(label)).applyCount).toBe(0);
  await ownerWorkspace.approveAction(first.id);
  expect(await actionState(label)).toEqual({
    pending: [{ id: 2, value: 8 }], value: 7, applyCount: 1,
  });
  const collaborator = (await ownerWorkspace.listCollaborators())
      .find(entry => entry.profile.id === collaboratorName);
  if (!collaborator) throw new Error("Expected the collaborator to remain listed");
  await ownerWorkspace.removeCollaborator(collaborator.profile.id, []);
  await expect(ownerWorkspace.approveAction(second.id)).rejects.toThrow(/no longer has access/i);
  expect(await actionState(label)).toEqual({ pending: [{ id: 2, value: 8 }], value: 7, applyCount: 1 });
  const approved = (await ownerWorkspace.listActions({ filter: "action" })).entries;
  expect(approved).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: first.id, state: "approved", type: "action" }),
    expect.objectContaining({ id: second.id, state: "pending", type: "action" }),
  ]));
  for (const entry of approved) {
    if (entry.type !== "action") throw new Error("Approved test action was not an action record");
    if (entry.id === first.id) {
      expect(entry.requestedBy).toMatchObject({ type: "user", id: collaboratorName });
      expect(entry.resolvedBy).toMatchObject({ type: "user", id: ownerName });
    }
  }
  expect(model.requests).toHaveLength(1);
  expect(model.remainingSteps()).toBe(1);
});
