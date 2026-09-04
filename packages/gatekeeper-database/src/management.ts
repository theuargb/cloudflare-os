import { RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type { AppUiContext } from "@gadgets/workshop-shared/gatekeeper";
import type { DatabaseSchemaProposal } from "@gadgets/workshop-shared/database";
import type {
  DatabaseAccessProfile,
  DatabaseAuditEntry,
  DatabaseManagementApi,
  DatabaseManagementSnapshot,
  DatabaseProposalValidation,
  DatabaseViewer,
} from "./management-types.js";
import { recompileProposal } from "./schema-designer.js";
import { DatabaseStore } from "./store.js";
import { compileSchema, mergeSchema, parseSchemaXml } from "./xml-schema.js";

type ProposalRow = {
  proposal_id: string;
  base_version: number;
  target_version: number;
  xml: string;
  breaking: number;
  status: DatabaseSchemaProposal["status"];
  created_at: string;
  updated_at: string;
};
function mapProposal(row: ProposalRow): DatabaseSchemaProposal {
  return {
    id: row.proposal_id,
    baseVersion: row.base_version,
    targetVersion: row.target_version,
    xml: row.xml,
    breaking: row.breaking === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** App API; mutations fail closed unless the app was opened by a deployment administrator. */
@validateRpc()
export class DatabaseManagementApiImpl
  extends RpcTarget
  implements DatabaseManagementApi
{
  constructor(
    private readonly env: Cloudflare.Env,
    private readonly context: AppUiContext,
  ) {
    super();
  }
  async getViewer(): Promise<DatabaseViewer> {
    return this.context;
  }
  #admin(): DatabaseAdminApiImpl {
    if (!this.context.isAdmin)
      throw new Error(
        "Database management requires deployment administrator access.",
      );
    return new DatabaseAdminApiImpl(this.env);
  }
  async validateProposal(
    id: string,
    xml: string,
  ): Promise<DatabaseProposalValidation> {
    return this.#admin().validateProposal(id, xml);
  }
  async saveProposal(id: string, xml: string): Promise<DatabaseSchemaProposal> {
    return this.#admin().saveProposal(id, xml);
  }
  async markProposalReady(id: string): Promise<void> {
    return this.#admin().markProposalReady(id);
  }
  async configureProfile(id: string): Promise<void> {
    return this.#admin().configureProfile(id);
  }
  async setProfileGrants(
    id: string,
    grants: DatabaseAccessProfile["grants"],
  ): Promise<void> {
    return this.#admin().setProfileGrants(id, grants);
  }
  async getSnapshot(): Promise<DatabaseManagementSnapshot> {
    let db = this.env.DATABASE,
      schema = await new DatabaseStore(db).getSchema();
    let [proposals, profiles, grants, audit] = await Promise.all([
      db
        .prepare(
          "SELECT proposal_id, base_version, target_version, xml, breaking, status, created_at, updated_at FROM database_schema_proposals ORDER BY updated_at DESC LIMIT 100",
        )
        .all<ProposalRow>(),
      db
        .prepare(
          "SELECT profile_id, configured FROM database_access_profiles ORDER BY updated_at DESC LIMIT 200",
        )
        .all<{ profile_id: string; configured: number }>(),
      db
        .prepare(
          "SELECT profile_id, table_name, column_name, permission FROM database_access_grants",
        )
        .all<{
          profile_id: string;
          table_name: string;
          column_name: string | null;
          permission: "read" | "write" | "table-write";
        }>(),
      db
        .prepare(
          "SELECT event_id, profile_id, operation, tables_json, schema_version, created_at FROM database_audit_events ORDER BY event_id DESC LIMIT 200",
        )
        .all<{
          event_id: number;
          profile_id: string | null;
          operation: string;
          tables_json: string;
          schema_version: number;
          created_at: string;
        }>(),
    ]);
    return {
      schema,
      proposals: proposals.results.map(mapProposal),
      profiles: profiles.results.map((profile) => ({
        id: profile.profile_id,
        configured: profile.configured === 1,
        grants: grants.results
          .filter((grant) => grant.profile_id === profile.profile_id)
          .map((grant) => ({
            table: grant.table_name,
            ...(grant.column_name ? { column: grant.column_name } : {}),
            permission: grant.permission,
          })),
      })),
      audit: audit.results.map(
        (event): DatabaseAuditEntry => ({
          id: event.event_id,
          ...(event.profile_id ? { profileId: event.profile_id } : {}),
          operation: event.operation,
          tables: JSON.parse(event.tables_json) as string[],
          schemaVersion: event.schema_version,
          createdAt: event.created_at,
        }),
      ),
    };
  }
}

class DatabaseAdminApiImpl {
  constructor(private readonly env: Cloudflare.Env) {}
  async #proposal(id: string): Promise<ProposalRow> {
    let row = await this.env.DATABASE.prepare(
      "SELECT proposal_id, base_version, target_version, xml, breaking, status, created_at, updated_at FROM database_schema_proposals WHERE proposal_id = ?",
    )
      .bind(id)
      .first<ProposalRow>();
    if (!row) throw new Error("Schema proposal not found.");
    return row;
  }
  async #compile(xml: string) {
    let store = new DatabaseStore(this.env.DATABASE),
      [schema, active] = await Promise.all([
        store.getSchema(),
        store.getModel(),
      ]);
    return {
      schema,
      compiled: compileSchema(
        active,
        mergeSchema(active, parseSchemaXml(xml)),
        schema.version + 1,
      ),
    };
  }
  async validateProposal(
    id: string,
    xml: string,
  ): Promise<DatabaseProposalValidation> {
    await this.#proposal(id);
    try {
      let { compiled } = await this.#compile(xml);
      return {
        valid: true,
        diagnostics: [],
        normalizedChanges: compiled.normalizedChanges,
        breaking: compiled.breaking,
      };
    } catch (cause) {
      return {
        valid: false,
        diagnostics: [
          { message: cause instanceof Error ? cause.message : String(cause) },
        ],
      };
    }
  }
  async saveProposal(id: string, xml: string): Promise<DatabaseSchemaProposal> {
    let current = await this.#proposal(id);
    if (current.status === "active" || current.status === "rejected")
      throw new Error("This proposal can no longer be edited.");
    let { schema, compiled } = await this.#compile(xml),
      now = new Date().toISOString();
    await this.env.DATABASE.prepare(
      "UPDATE database_schema_proposals SET base_version = ?, target_version = ?, xml = ?, compiled_json = ?, breaking = ?, status = 'pending', updated_at = ? WHERE proposal_id = ?",
    )
      .bind(
        schema.version,
        schema.version + 1,
        xml,
        JSON.stringify(compiled),
        compiled.breaking ? 1 : 0,
        now,
        id,
      )
      .run();
    return {
      id,
      baseVersion: schema.version,
      targetVersion: schema.version + 1,
      xml,
      breaking: compiled.breaking,
      status: "pending",
      createdAt: current.created_at,
      updatedAt: now,
    };
  }
  async markProposalReady(id: string): Promise<void> {
    let { record, compiled } = await recompileProposal(this.env.DATABASE, id),
      now = new Date().toISOString();
    if (record.status !== "pending" && record.status !== "stale")
      throw new Error("Only pending proposals can be marked ready.");
    await this.env.DATABASE.prepare(
      "UPDATE database_schema_proposals SET base_version = ?, target_version = ?, compiled_json = ?, breaking = ?, status = 'ready', updated_at = ? WHERE proposal_id = ? AND status IN ('pending', 'stale')",
    )
      .bind(
        record.baseVersion,
        record.targetVersion,
        JSON.stringify(compiled),
        record.breaking ? 1 : 0,
        now,
        id,
      )
      .run();
  }
  async configureProfile(id: string): Promise<void> {
    let model = await new DatabaseStore(this.env.DATABASE).getModel(),
      now = new Date().toISOString();
    let grants = model.tables.flatMap((table) => [
      { permission: "table-write", table: table.name, column: null },
      ...table.columns.flatMap((column) => [
        { permission: "read", table: table.name, column: column.name },
        { permission: "write", table: table.name, column: column.name },
      ]),
    ]);
    await this.env.DATABASE.batch([
      this.env.DATABASE.prepare(
        "UPDATE database_access_profiles SET configured = 1, updated_at = ? WHERE profile_id = ?",
      ).bind(now, id),
      this.env.DATABASE.prepare(
        "DELETE FROM database_access_grants WHERE profile_id = ?",
      ).bind(id),
      ...grants.map((grant) =>
        this.env.DATABASE.prepare(
          "INSERT INTO database_access_grants (profile_id, table_name, column_name, permission) VALUES (?, ?, ?, ?)",
        ).bind(id, grant.table, grant.column, grant.permission),
      ),
    ]);
  }
  async setProfileGrants(
    id: string,
    grants: DatabaseAccessProfile["grants"],
  ): Promise<void> {
    if (
      !grants.every(
        (grant) =>
          /^[a-z][a-z0-9_]*$/.test(grant.table) &&
          (!grant.column || /^[a-z][a-z0-9_]*$/.test(grant.column)),
      )
    )
      throw new Error("Invalid access grant.");
    let now = new Date().toISOString();
    await this.env.DATABASE.batch([
      this.env.DATABASE.prepare(
        "UPDATE database_access_profiles SET configured = 1, updated_at = ? WHERE profile_id = ?",
      ).bind(now, id),
      this.env.DATABASE.prepare(
        "DELETE FROM database_access_grants WHERE profile_id = ?",
      ).bind(id),
      ...grants.map((grant) =>
        this.env.DATABASE.prepare(
          "INSERT INTO database_access_grants (profile_id, table_name, column_name, permission) VALUES (?, ?, ?, ?)",
        ).bind(id, grant.table, grant.column ?? null, grant.permission),
      ),
    ]);
  }
}
