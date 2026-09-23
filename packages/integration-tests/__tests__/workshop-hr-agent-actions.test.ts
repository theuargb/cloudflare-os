import { afterAll, beforeAll, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerConfig } from "../src/harness.js";
import { startHarness, ADMIN_USERNAME, type Harness } from "../src/harness.js";
import { openAgentSession } from "../src/agent-session.js";
import {
  scriptedChatCompletions, SCRIPTED_MODEL_CONFIG, SCRIPTED_MODEL_ID,
  SCRIPTED_MODEL_PROFILE,
} from "../src/mock-model.js";
import { NetworkInterceptor } from "../src/network-interceptor.js";
import { connect, signUp, waitFor } from "../src/rpc-client.js";

const STARTER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const HR_DIR = resolve(STARTER_ROOT, "packages/gatekeeper-1c-hr-payroll");
const DATABASE_DIR = resolve(STARTER_ROOT, "packages/gatekeeper-database");
const DATABASE_BOOTSTRAP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/hr-database-bootstrap");
const EMPLOYEE_NAME = "Workshop Integration Employee";
const CREATE_EMPLOYEE_CODE = `export default async function(self, env) {
  console.log(JSON.stringify(await env.HR_PAYROLL.createEmployee({ fullName: ${JSON.stringify(EMPLOYEE_NAME)}, department: "Integration Test", position: "Agent Created" })));
}`;
const LIST_EMPLOYEES_CODE = `export default async function(self, env) {
  console.log(JSON.stringify(await env.HR_PAYROLL.listEmployees()));
}`;

let harness: Harness;
const model = scriptedChatCompletions([
  { toolCall: { id: "create-employee", name: "executeCode", arguments: { code: CREATE_EMPLOYEE_CODE } } },
  { text: "The employee was created after approval." },
  { toolCall: { id: "read-employees", name: "executeCode", arguments: { code: LIST_EMPLOYEES_CODE } } },
  { text: "The employee list includes Workshop Integration Employee." },
]);
const network = new NetworkInterceptor({ handlers: [model.handler] });

beforeAll(async () => {
  network.install();
  harness = await startHarness({
    root: STARTER_ROOT,
    enableGadgetExecution: true,
    gatekeepers: [
      {
        binding: "DATABASE",
        dir: DATABASE_DIR,
        patch(config: WorkerConfig) {
          const database = config as WorkerConfig & { d1_databases?: Array<{ migrations_dir?: string; database_name?: string; database_id?: string }> };
          for (const binding of database.d1_databases ?? []) {
            binding.migrations_dir = resolve(DATABASE_DIR, "migrations");
            binding.database_name = "hr-agent-integration";
            binding.database_id = "00000000-0000-0000-0000-000000000001";
          }
        },
      },
      { binding: "HR_DB_BOOTSTRAP", dir: DATABASE_BOOTSTRAP_DIR },
      {
        binding: "HR_PAYROLL",
        dir: HR_DIR,
        patch(config: WorkerConfig) {
          const service = {
            binding: "DATABASE_SCHEMA",
            service: "gatekeeper-database",
            entrypoint: "DomainSchemaService",
            props: { domainId: "hr-payroll" },
          };
          config.services = [...(config.services ?? []), service as NonNullable<WorkerConfig["services"]>[number]];
        },
      },
    ],
  });
});

afterAll(async () => {
  try {
    await harness?.server.close();
    expect(network.getUnmockedCalls()).toEqual([]);
  } finally {
    network.uninstall();
  }
});

it("creates an HR employee through AI approval and reads the persisted result", async () => {
  const publicApi = connect(harness.url);
  using adminApi = await signUp(publicApi, ADMIN_USERNAME);

  const bootstrap = await harness.fetchWorker("integration-hr-database-bootstrap", "http://hr-db-bootstrap.test/__test/bootstrap", { method: "POST" });
  expect(bootstrap.status).toBe(204);

  // The real HR management API requests the code-owned schema through the real Database domain
  // service binding. This is setup for the business flow, not a test substitute for HR behavior.
  await adminApi.provisionAmbientAccount("database");
  await adminApi.provisionAmbientAccount("hr_payroll");
  const hrApp = await waitFor("the real HR management app", async () =>
    (await adminApi.listGatekeeperApps()).find(app => app.id === "hr_payroll") ?? null);
  const frame = await adminApi.getGatekeeperApp(hrApp.id);
  if (!frame) throw new Error("The HR management app did not return its UI capability");
  const management = frame.ui as unknown as {
    requestStorageSchema(): Promise<{ status: string }>;
    listEmployees(): Promise<Array<{ id: string; fullName: string }>>;
    listAuditEvents(): Promise<Array<{ actorId: string; actorName: string; operation: string; outcome: string }>>;
    [Symbol.dispose](): void;
  };
  try {
    expect(await management.requestStorageSchema()).toMatchObject({ status: "schema-active" });

    await using session = await openAgentSession(harness.url, {
      modelId: SCRIPTED_MODEL_ID,
      userModel: { profile: SCRIPTED_MODEL_PROFILE, config: SCRIPTED_MODEL_CONFIG },
      ambientVendorIds: ["hr_payroll"],
      usernamePrefix: "hragent",
    });
    const createTurn = await session.runTurn("Create an employee named Workshop Integration Employee in Integration Test as Agent Created.");
    expect(createTurn.outcome).toEqual({ status: "completed" });

    const pending = await waitFor("the HR employee action to await approval", async () => {
      const actions = (await session.listActions({ filter: "pending" })).entries;
      return actions.length === 1 ? actions[0] : null;
    });
    if (pending.type !== "action") throw new Error("The HR employee request was not an approval action");
    expect(pending.description).toMatchObject({ awaitDecision: true, autoApprovable: false });
    expect(pending.requestedBy).toMatchObject({ type: "user", id: session.username });
    expect(await management.listEmployees()).toEqual([]);

    const resumed = await session.approveActionsAndWait([pending.id]);
    expect(resumed.outcome).toEqual({ status: "completed" });
    const employees = await waitFor("the approved HR employee", async () => {
      const current = await management.listEmployees();
      return current.some(employee => employee.fullName === EMPLOYEE_NAME) ? current : null;
    });
    expect(employees.filter(employee => employee.fullName === EMPLOYEE_NAME)).toHaveLength(1);
    const history = (await session.listActions({ filter: "action" })).entries;
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: pending.id,
        state: "approved",
        requestedBy: expect.objectContaining({ id: session.username }),
        resolvedBy: expect.objectContaining({ id: session.username }),
      }),
    ]));
    const audit = await management.listAuditEvents();
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: session.username, actorName: session.username, operation: "create.employee", outcome: "succeeded" }),
    ]));

    const readTurn = await session.runTurn("List the employees and confirm the newly added employee is present.");
    expect(readTurn.outcome).toEqual({ status: "completed" });
    expect(model.requests).toHaveLength(4);
    expect(model.requests.slice(2).some(request => JSON.stringify(request).includes(EMPLOYEE_NAME))).toBe(true);
    expect(model.remainingSteps()).toBe(0);
  } finally {
    management[Symbol.dispose]();
  }
});
