import { RpcTarget, type RpcStub } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type { DatabaseData, DatabaseResult, DatabaseSchema, DatabaseStatement, DatabaseValue } from "@gadgets/workshop-shared/database";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import { authorizeSql, parameters } from "./sql-authorizer.js";
import { DatabaseStore } from "./store.js";

type ProfileRow = {configured: number};

/** A connection-scoped data session; authority is its opaque access-profile id. */
@validateRpc()
export class DatabaseDataSession extends RpcTarget implements DatabaseData {
  constructor(private readonly db: D1Database, private readonly profileId: string, private readonly queue: RpcStub<ApprovalQueue>) { super(); }

  private async profile() {
    let row = await this.db.prepare("SELECT configured FROM database_access_profiles WHERE profile_id = ?").bind(this.profileId).first<ProfileRow>();
    if (!row) await this.db.prepare("INSERT OR IGNORE INTO database_access_profiles (profile_id, configured, created_at, updated_at) VALUES (?, 0, ?, ?)").bind(this.profileId, new Date().toISOString(), new Date().toISOString()).run();
    let grants = await this.db.prepare("SELECT permission, table_name, column_name FROM database_access_grants WHERE profile_id = ?").bind(this.profileId).all<{permission: string; table_name: string; column_name: string | null}>();
    return {configured: row?.configured === 1, grants: new Set(grants.results.map(grant => `${grant.permission}:${grant.table_name}:${grant.column_name ?? "*"}`))};
  }

  private async checked(sql: string) {
    let store = new DatabaseStore(this.db), [model, profile] = await Promise.all([store.getModel(), this.profile()]);
    return {schema: await store.getSchema(), authorization: await authorizeSql(sql, model, profile)};
  }

  private async audit(operation: string, tables: string[], version: number): Promise<void> {
    await this.db.prepare("INSERT INTO database_audit_events (profile_id, operation, tables_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?)").bind(this.profileId, operation, JSON.stringify(tables), version, new Date().toISOString()).run();
  }

  /** Returns the active canonical schema after recording an observation. */
  async getSchema(): Promise<DatabaseSchema> {
    let schema = await new DatabaseStore(this.db).getSchema();
    await this.queue.authorizeObservation({title: "Inspect database schema", description: `Read schema version ${schema.version}.`});
    await this.audit("schema.read", [], schema.version);
    return schema;
  }

  /** Runs one authorized data statement synchronously against D1. */
  async run(sql: string, params?: DatabaseValue[]): Promise<DatabaseResult> {
    let {schema, authorization} = await this.checked(sql), result = await this.db.withSession("first-primary").prepare(sql).bind(...parameters(params)).all<Record<string, DatabaseValue>>();
    if (!authorization.write) await this.queue.authorizeObservation({title: "Read database data", description: `Read ${authorization.tables.join(", ") || "database data"}.`});
    await this.audit(authorization.write ? "data.write" : "data.read", authorization.tables, schema.version);
    return {results: result.results, meta: result.meta};
  }

  /** Authorizes every statement before executing the ordered D1 batch atomically. */
  async batch(statements: DatabaseStatement[]): Promise<DatabaseResult[]> {
    if (!statements.length) return [];
    let checked = await Promise.all(statements.map(statement => this.checked(statement.sql))), schema = checked[0]!.schema;
    if (checked.some(item => item.schema.version !== schema.version)) throw new Error("Schema changed while preparing the batch; retry it.");
    let session = this.db.withSession("first-primary"), result = await session.batch(statements.map(statement => session.prepare(statement.sql).bind(...parameters(statement.params))));
    let reads = checked.filter(item => !item.authorization.write);
    if (reads.length) await this.queue.authorizeObservation({title: "Read database data", description: "Read data as part of an atomic database batch."});
    await this.audit("data.batch", checked.flatMap(item => item.authorization.tables), schema.version);
    return result.map(item => ({results: item.results as Record<string, DatabaseValue>[], meta: item.meta}));
  }
}
