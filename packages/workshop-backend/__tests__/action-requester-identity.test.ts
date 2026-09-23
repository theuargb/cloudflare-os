import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { OverseerDurableObject } from "../src/overseer.js";
import type { ActionDescription } from "@gadgets/workshop-shared/gatekeeper";

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    TEST_OVERSEER: DurableObjectNamespace<OverseerDurableObject>;
  }
}

const actor = { actorId: "alice", actor: {displayName: "Alice"}, isAdmin: false };
const description: ActionDescription = {
  title: "Set a value",
  description: "Set the test value.",
  implementsRevert: false,
};

async function inOverseer(name: string, fn: (impl: any) => Promise<void>): Promise<void> {
  const stub = env.TEST_OVERSEER.getByName(name);
  await runInDurableObject(stub, async (instance: OverseerDurableObject) => {
    await fn((instance as unknown as {impl: any}).impl);
  });
}

it("rejects gadget, hook, and unattributed user actions before persistence", async () => {
  await inOverseer("action-requester-missing", async impl => {
    for (const caller of [
      {from: "gadget", gadgetId: 1},
      {from: "hook"},
      {from: "user"},
    ]) {
      await expect(impl.submitAction(7, 1, description, caller))
          .rejects.toThrow(/no verifiable authenticated initiating actor/);
    }
    expect(Array.from(impl.storage.actions.list())).toEqual([]);
    expect(impl.storage.nextActionId.get()).toBe(0);
  });
});

it("records an authenticated user requester and re-resolves that actor on apply", async () => {
  await inOverseer("action-requester-live", async impl => {
    let currentActor = actor;
    const contexts: string[] = [];
    impl.getActionContextForUser = async (userId: string) => {
      contexts.push(userId);
      return currentActor;
    };
    await impl.submitAction(7, 1, description, {from: "user", userId: "alice"});

    const record = Array.from(impl.storage.actions.list())[0] as any;
    expect(record.requestedBy).toEqual({type: "user", id: "alice", name: "Alice"});
    expect(record.requestedActorUserId).toBe("alice");
    expect(record.resolvedBy).toBeUndefined();

    const freshActor = {...actor, actor: {displayName: "Alice updated"}, isAdmin: true};
    currentActor = freshActor;
    let appliedContext: unknown;
    impl.getGatekeeperFacet = () => ({
      async applyAction(_action: number, _cache: unknown, context: unknown) {
        appliedContext = context;
      },
    });
    await impl.applyPendingAction(record, {type: "user", id: "approver", name: "Approver"}, false);

    expect(contexts).toEqual(["alice", "alice"]);
    expect(appliedContext).toEqual(freshActor);
    expect(impl.storage.actions.get(record.id).resolvedBy)
        .toEqual({type: "user", id: "approver", name: "Approver"});
  });
});
