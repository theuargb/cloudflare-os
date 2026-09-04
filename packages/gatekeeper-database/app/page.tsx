import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Empty,
  Select,
  Tabs,
  useKumoToastManager,
} from "@cloudflare/kumo";
import {
  ArrowClockwise,
  CheckCircle,
  Database,
  ShieldCheck,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { RpcStub } from "capnweb";
import type { DatabaseSchemaProposal } from "@gadgets/workshop-shared/database";
import type {
  DatabaseAccessProfile,
  DatabaseManagementApi,
  DatabaseManagementSnapshot,
  DatabaseProposalValidation,
  DatabaseViewer,
} from "../src/management-types";
import { XmlEditor } from "./XmlEditor";

type Tab = "overview" | "schema" | "access" | "audit";
type Grant = DatabaseAccessProfile["grants"][number];
const problem = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const proposalVariant = (status: DatabaseSchemaProposal["status"]) =>
  status === "active"
    ? "success"
    : status === "rejected"
      ? "error"
      : status === "stale"
        ? "warning"
        : "info";
function tablesFrom(xml: string) {
  let doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("table")].map((table) => ({
    name: table.getAttribute("name")!,
    columns: [...table.querySelectorAll(":scope > column")].map(
      (column) => column.getAttribute("name")!,
    ),
  }));
}

function Confirm({
  open,
  title,
  description,
  label,
  danger,
  busy,
  setPresenting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  danger?: boolean;
  busy: boolean;
  setPresenting: (active: boolean) => Promise<void>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    void setPresenting(open);
    return () => {
      void setPresenting(false);
    };
  }, [open, setPresenting]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog className="confirm-dialog" size="sm">
        <div className="dialog-head">
          <div>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </div>
          <Button
            variant="ghost"
            shape="square"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            loading={busy}
            onClick={onConfirm}
          >
            {label}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function Overview({ data }: { data: DatabaseManagementSnapshot }) {
  let open = data.proposals.filter((item) =>
    ["pending", "ready", "stale"].includes(item.status),
  ).length;
  return (
    <div className="stack">
      <div className="metrics">
        <article>
          <span>Schema version</span>
          <strong>{data.schema.version}</strong>
        </article>
        <article>
          <span>Open proposals</span>
          <strong>{open}</strong>
        </article>
        <article>
          <span>Access profiles</span>
          <strong>{data.profiles.length}</strong>
        </article>
        <article>
          <span>Audit events</span>
          <strong>{data.audit.length}</strong>
        </article>
      </div>
      <section className="panel prose">
        <ShieldCheck size={22} />
        <div>
          <h2>Installation database</h2>
          <p>
            Unconfigured connections have full business-data access. Configured
            profiles use explicit table and column grants. Schema changes wait
            for deployment-admin review.
          </p>
        </div>
      </section>
      <section className="panel">
        <h2>Active canonical XML</h2>
        <pre className="canonical">{data.schema.xml}</pre>
      </section>
    </div>
  );
}

function SchemaView({
  api,
  data,
  viewer,
  busy,
  run,
  resolveReview,
  setPresenting,
}: {
  api: RpcStub<DatabaseManagementApi>;
  data: DatabaseManagementSnapshot;
  viewer: DatabaseViewer;
  busy: boolean;
  run: (action: () => Promise<void>, success: string) => Promise<void>;
  resolveReview: (key: string, decision: "approve" | "reject") => Promise<void>;
  setPresenting: (active: boolean) => Promise<void>;
}) {
  let [selected, setSelected] = useState(data.proposals[0]?.id),
    proposal =
      data.proposals.find((item) => item.id === selected) ?? data.proposals[0];
  let [xml, setXml] = useState(proposal?.xml ?? ""),
    [validation, setValidation] = useState<DatabaseProposalValidation>({
      valid: true,
      diagnostics: [],
    }),
    [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  useEffect(() => {
    if (proposal) {
      setSelected(proposal.id);
      setXml(proposal.xml);
      setValidation({ valid: true, diagnostics: [] });
    }
  }, [proposal?.id, proposal?.xml]);
  let dirty = !!proposal && xml !== proposal.xml;
  useEffect(() => {
    let handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  if (!proposal)
    return (
      <section className="panel">
        <h2>Schema proposals</h2>
        <Empty
          title="No schema proposals"
          description="Schema proposals submitted by agents will appear here."
          size="sm"
        />
      </section>
    );
  let editable =
    viewer.isAdmin && !["active", "rejected"].includes(proposal.status);
  let validate = () =>
    run(async () => {
      let result = await api.validateProposal(proposal.id, xml);
      setValidation(result);
      if (!result.valid)
        throw new Error(result.diagnostics[0]?.message ?? "Validation failed.");
    }, "XML is valid");
  return (
    <>
      <div className="schema-layout">
        <section className="panel proposal-panel">
          <h2>Proposals</h2>
          <div className="proposal-list">
            {data.proposals.map((item) => (
              <button
                type="button"
                className={
                  item.id === proposal.id ? "proposal selected" : "proposal"
                }
                key={item.id}
                onClick={() => setSelected(item.id)}
              >
                <strong>Schema v{item.targetVersion}</strong>
                <span className="badge-row">
                  <Badge variant={proposalVariant(item.status)}>
                    {item.status}
                  </Badge>
                  {item.breaking && <Badge variant="warning">breaking</Badge>}
                </span>
                <small>{new Date(item.updatedAt).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="panel editor-panel">
          <div className="section-head">
            <div>
              <h2>XML proposal</h2>
              <p>
                v{proposal.baseVersion} → v{proposal.targetVersion}
                {dirty && " · unsaved"}
              </p>
            </div>
            <span className="id">{proposal.id}</span>
          </div>
          {!viewer.isAdmin && (
            <div className="notice">
              <Warning /> Read-only. Deployment administrator access is
              required.
            </div>
          )}
          <XmlEditor
            value={xml}
            onChange={setXml}
            disabled={!editable || busy}
            diagnostics={validation.diagnostics}
          />
          <div
            className={
              validation.valid ? "validation valid" : "validation invalid"
            }
          >
            {validation.valid ? (
              <>
                <CheckCircle />{" "}
                {validation.normalizedChanges === undefined
                  ? "Not yet validated"
                  : `${validation.normalizedChanges} normalized changes${validation.breaking ? " · breaking" : ""}`}
              </>
            ) : (
              <>
                <Warning /> {validation.diagnostics[0]?.message}
              </>
            )}
          </div>
          {viewer.isAdmin && (
            <div className="actions">
              <Button
                variant="secondary"
                disabled={!editable || busy}
                onClick={() => void validate().catch(() => {})}
              >
                Validate
              </Button>
              <Button
                variant="secondary"
                disabled={!editable || busy || !dirty}
                onClick={() =>
                  void run(
                    () => api.saveProposal(proposal.id, xml),
                    "Proposal saved",
                  ).catch(() => {})
                }
              >
                Save
              </Button>
              <Button
                variant="secondary"
                disabled={
                  !editable ||
                  busy ||
                  dirty ||
                  !["pending", "stale"].includes(proposal.status)
                }
                onClick={() =>
                  void run(
                    () => api.markProposalReady(proposal.id),
                    proposal.status === "stale"
                      ? "Proposal rebased and ready"
                      : "Proposal marked ready",
                  ).catch(() => {})
                }
              >
                {proposal.status === "stale"
                  ? "Rebase and validate"
                  : "Mark ready"}
              </Button>
              <Button
                disabled={busy || dirty || proposal.status !== "ready"}
                onClick={() => setDecision("approve")}
              >
                Activate
              </Button>
              <Button
                variant="destructive"
                disabled={
                  busy || ["active", "rejected"].includes(proposal.status)
                }
                onClick={() => setDecision("reject")}
              >
                Reject
              </Button>
            </div>
          )}
        </section>
      </div>
      <section className="panel help">
        <h2>XML format</h2>
        <p>{data.schema.format.guide}</p>
        <details>
          <summary>Autoincrement example</summary>
          <pre>{data.schema.format.examples.create}</pre>
        </details>
        <details>
          <summary>Enum example</summary>
          <pre>
            {
              '<constraint name="customers_status_enum" type="enum" columns="status" values="draft,active,disabled"/>'
            }
          </pre>
        </details>
      </section>
      <Confirm
        open={decision !== null}
        title={
          decision === "approve"
            ? proposal.breaking
              ? "Activate breaking schema change?"
              : "Activate schema change?"
            : "Reject schema proposal?"
        }
        description={
          decision === "approve"
            ? "The waiting chat resumes only after activation succeeds."
            : "Rejection ends the suspended turn and does not activate this proposal."
        }
        label={decision === "approve" ? "Activate" : "Reject"}
        danger={decision === "reject" || proposal.breaking}
        busy={busy}
        setPresenting={setPresenting}
        onClose={() => setDecision(null)}
        onConfirm={() =>
          void run(
            () => resolveReview(proposal.id, decision!),
            decision === "approve" ? "Schema activated" : "Proposal rejected",
          )
            .then(() => setDecision(null))
            .catch(() => {})
        }
      />
    </>
  );
}

function AccessView({
  api,
  data,
  viewer,
  busy,
  run,
  setPresenting,
}: {
  api: RpcStub<DatabaseManagementApi>;
  data: DatabaseManagementSnapshot;
  viewer: DatabaseViewer;
  busy: boolean;
  run: (action: () => Promise<void>, success: string) => Promise<void>;
  setPresenting: (active: boolean) => Promise<void>;
}) {
  let [selected, setSelected] = useState(data.profiles[0]?.id),
    profile =
      data.profiles.find((item) => item.id === selected) ?? data.profiles[0],
    [grants, setGrants] = useState<Grant[]>(profile?.grants ?? []),
    [confirm, setConfirm] = useState(false);
  useEffect(
    () => setGrants(profile?.grants ?? []),
    [profile?.id, profile?.grants],
  );
  let tables = useMemo(() => tablesFrom(data.schema.xml), [data.schema.xml]);
  if (!profile)
    return (
      <section className="panel">
        <h2>Access profiles</h2>
        <Empty
          title="No access profiles"
          description="Access profiles appear after a data connection is configured."
          size="sm"
        />
      </section>
    );
  let has = (
    table: string,
    column: string | undefined,
    permission: Grant["permission"],
  ) =>
    grants.some(
      (item) =>
        item.table === table &&
        item.column === column &&
        item.permission === permission,
    );
  let toggle = (grant: Grant, checked: boolean) =>
    setGrants((current) =>
      checked
        ? [
            ...current.filter(
              (item) =>
                !(
                  item.table === grant.table &&
                  item.column === grant.column &&
                  item.permission === grant.permission
                ),
            ),
            grant,
          ]
        : current.filter(
            (item) =>
              !(
                item.table === grant.table &&
                item.column === grant.column &&
                item.permission === grant.permission
              ),
          ),
    );
  let toggleColumns = (
    table: { name: string; columns: string[] },
    permission: "read" | "write",
    checked: boolean,
  ) =>
    setGrants((current) => {
      let rest = current.filter(
        (item) =>
          !(
            item.table === table.name &&
            item.column &&
            item.permission === permission
          ),
      );
      return checked
        ? [
            ...rest,
            ...table.columns.map((column) => ({
              table: table.name,
              column,
              permission,
            })),
          ]
        : rest;
    });
  let dirty = JSON.stringify(grants) !== JSON.stringify(profile.grants);
  return (
    <div className="stack">
      <section className="panel access-head">
        <div>
          <h2>Access profile</h2>
          <p>Changes are staged until Save.</p>
        </div>
        <Select
          value={profile.id}
          onValueChange={(value) => setSelected(String(value))}
          items={data.profiles.map((item) => ({
            label: item.id,
            value: item.id,
          }))}
          aria-label="Access profile"
        />
        <Select
          value={profile.configured ? "configured" : "full"}
          disabled
          items={{ full: "Full access", configured: "Configured access" }}
          aria-label="Access mode"
        />
      </section>
      {!profile.configured ? (
        <section className="panel prose">
          <div>
            <h2>Full access</h2>
            <p>
              This profile can read and write all current and future business
              tables. Configuration seeds grants for current objects; future
              objects remain denied.
            </p>
            {viewer.isAdmin && (
              <Button disabled={busy} onClick={() => setConfirm(true)}>
                Configure access
              </Button>
            )}
          </div>
        </section>
      ) : (
        <section className="panel access-grid">
          <div className="grid-row grid-header">
            <strong>Table / column</strong>
            <strong>Read</strong>
            <strong>Write</strong>
          </div>
          {tables.map((table) => (
            <div className="table-block" key={table.name}>
              <div className="grid-row table-row">
                <strong>{table.name}</strong>
                <Checkbox
                  aria-label={`Read all ${table.name}`}
                  checked={table.columns.every((column) =>
                    has(table.name, column, "read"),
                  )}
                  onCheckedChange={(checked) =>
                    toggleColumns(table, "read", checked)
                  }
                />
                <Checkbox
                  aria-label={`Write all ${table.name}`}
                  checked={table.columns.every((column) =>
                    has(table.name, column, "write"),
                  )}
                  onCheckedChange={(checked) => {
                    toggleColumns(table, "write", checked);
                    toggle(
                      { table: table.name, permission: "table-write" },
                      checked,
                    );
                  }}
                />
              </div>
              {table.columns.map((column) => (
                <div className="grid-row" key={column}>
                  <span>{column}</span>
                  <Checkbox
                    aria-label={`Read ${table.name}.${column}`}
                    checked={has(table.name, column, "read")}
                    onCheckedChange={(checked) =>
                      toggle(
                        { table: table.name, column, permission: "read" },
                        checked,
                      )
                    }
                  />
                  <Checkbox
                    aria-label={`Write ${table.name}.${column}`}
                    checked={has(table.name, column, "write")}
                    onCheckedChange={(checked) =>
                      toggle(
                        { table: table.name, column, permission: "write" },
                        checked,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ))}
          <div className="actions">
            <Button
              disabled={!viewer.isAdmin || busy || !dirty}
              onClick={() =>
                void run(
                  () => api.setProfileGrants(profile.id, grants),
                  "Access profile saved",
                ).catch(() => {})
              }
            >
              Save changes
            </Button>
          </div>
        </section>
      )}
      <Confirm
        open={confirm}
        title="Configure this profile?"
        description="Full access will be replaced by explicit grants for every current table and column. Future objects remain denied."
        label="Configure"
        busy={busy}
        setPresenting={setPresenting}
        onClose={() => setConfirm(false)}
        onConfirm={() =>
          void run(
            () => api.configureProfile(profile.id),
            "Access profile configured",
          )
            .then(() => setConfirm(false))
            .catch(() => {})
        }
      />
    </div>
  );
}

export default function DatabasePage({
  api,
  resolveReview,
  setPresenting,
}: {
  api: RpcStub<DatabaseManagementApi>;
  resolveReview: (key: string, decision: "approve" | "reject") => Promise<void>;
  setPresenting: (active: boolean) => Promise<void>;
}) {
  let [data, setData] = useState<DatabaseManagementSnapshot>(),
    [viewer, setViewer] = useState<DatabaseViewer>(),
    [tab, setTab] = useState<Tab>("overview"),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false),
    epoch = useRef(0),
    toasts = useKumoToastManager();
  let load = useCallback(async () => {
    let request = ++epoch.current;
    setError(undefined);
    try {
      let [next, nextViewer] = await Promise.all([
        api.getSnapshot(),
        api.getViewer(),
      ]);
      if (request === epoch.current) {
        setData(next);
        setViewer(nextViewer);
      }
    } catch (cause) {
      if (request === epoch.current) setError(problem(cause));
    }
  }, [api]);
  useEffect(() => {
    void load();
    return () => {
      ++epoch.current;
    };
  }, [load]);
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await load();
      toasts.add({ title: success, variant: "success" });
    } catch (cause) {
      let text = problem(cause);
      setError(text);
      toasts.add({ title: text, variant: "error" });
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  if (!data || !viewer)
    return (
      <main className="shell state">
        <Database />
        <p>{error ?? "Loading Database…"}</p>
        {error && (
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        )}
      </main>
    );
  return (
    <main className="shell">
      <header>
        <div className="title">
          <Database size={28} />
          <div>
            <h1>Database</h1>
            <p>Installation D1 · schema v{data.schema.version}</p>
          </div>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          <ArrowClockwise /> Refresh
        </Button>
      </header>
      {error && (
        <div className="notice error">
          <Warning /> {error}
        </div>
      )}
      <Tabs
        className="tabs"
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "schema", label: "Schema" },
          { value: "access", label: "Access" },
          { value: "audit", label: "Audit" },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
      />
      {tab === "overview" && <Overview data={data} />}{" "}
      {tab === "schema" && (
        <SchemaView
          api={api}
          data={data}
          viewer={viewer}
          busy={busy}
          run={run}
          resolveReview={resolveReview}
          setPresenting={setPresenting}
        />
      )}{" "}
      {tab === "access" && (
        <AccessView
          api={api}
          data={data}
          viewer={viewer}
          busy={busy}
          run={run}
          setPresenting={setPresenting}
        />
      )}{" "}
      {tab === "audit" && (
        <section className="panel">
          <h2>Audit</h2>
          {data.audit.length ? (
            <div className="audit-list">
              {data.audit.map((event) => (
                <article className="audit-row" key={event.id}>
                  <div>
                    <strong>{event.operation}</strong>
                    <span>{event.tables.join(", ") || "schema"}</span>
                  </div>
                  <div>
                    <span>Schema v{event.schemaVersion}</span>
                    <span>{event.profileId ?? "system"}</span>
                    <time>{new Date(event.createdAt).toLocaleString()}</time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No audit events"
              description="Database operations will appear here after they run."
              size="sm"
            />
          )}
        </section>
      )}
    </main>
  );
}
