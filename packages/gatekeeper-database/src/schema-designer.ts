import { RpcTarget, type RpcStub } from "cloudflare:workers";
import { skipRpcValidation } from "capnweb-validate";
import type { ApprovalQueue } from "@gadgets/workshop-shared/gatekeeper";
import type { DatabaseSchema, DatabaseSchemaDesigner, DatabaseSchemaProposal } from "@gadgets/workshop-shared/database";
import { ActionJournal, stageAction } from "@gadgets/gatekeeper-kit/actions";
import { compileSchema, mergeSchema, parseSchemaXml } from "./xml-schema.js";
import { DatabaseStore } from "./store.js";

type StoredAction = {proposalId: string};
type ProposalRow = {proposal_id: string; base_version: number; target_version: number; xml: string; breaking: number; status: DatabaseSchemaProposal["status"]; created_at: string; updated_at: string};
function id(): string { return crypto.randomUUID().replaceAll("-", ""); }
function proposal(row: ProposalRow): DatabaseSchemaProposal { return {id: row.proposal_id, baseVersion: row.base_version, targetVersion: row.target_version, xml: row.xml, breaking: row.breaking === 1, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at}; }

/** Schema-only resource session. It stores proposals before queue submission. */
export class DatabaseSchemaDesignerSession extends RpcTarget implements DatabaseSchemaDesigner {
  constructor(private readonly db: D1Database, private readonly queue: RpcStub<ApprovalQueue>, private readonly journal: ActionJournal<StoredAction>) { super(); }
  /** Reads the canonical active XML schema. */
  async getSchema(): Promise<DatabaseSchema> {
    let schema = await new DatabaseStore(this.db).getSchema();
    await this.queue.authorizeObservation({title: "Inspect database schema", description: `Read schema version ${schema.version}.`});
    return schema;
  }
  /** Validates, compiles, persists, and submits an XML fragment for review. */
  @skipRpcValidation()
  async proposeSchema(xml: string): Promise<DatabaseSchemaProposal> {
    let store = new DatabaseStore(this.db), [schema, active] = await Promise.all([store.getSchema(), store.getModel()]);
    let fragment = parseSchemaXml(xml), compiled = compileSchema(active, mergeSchema(active, fragment), schema.version + 1), now = new Date().toISOString();
    let record: DatabaseSchemaProposal = {id: id(), baseVersion: schema.version, targetVersion: schema.version + 1, xml, breaking: compiled.breaking, status: "pending", createdAt: now, updatedAt: now};
    await this.db.prepare("INSERT INTO database_schema_proposals (proposal_id, base_version, target_version, xml, compiled_json, breaking, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)").bind(record.id, record.baseVersion, record.targetVersion, record.xml, JSON.stringify(compiled), record.breaking ? 1 : 0, now, now).run();
    await stageAction(this.journal, this.queue, {proposalId: record.id}, {title: `Review database schema v${record.targetVersion}`, description: `${fragment.summary}\n\nProposal: ${record.id}`, implementsRevert: false, awaitDecision: true, reviewApp: {appId: "database", key: record.id}});
    return record;
  }
  /** Reloads one persisted proposal. */
  async getProposal(proposalId: string): Promise<DatabaseSchemaProposal> {
    let row = await this.db.prepare("SELECT proposal_id, base_version, target_version, xml, breaking, status, created_at, updated_at FROM database_schema_proposals WHERE proposal_id = ?").bind(proposalId).first<ProposalRow>();
    if (!row) throw new Error("Schema proposal not found.");
    await this.queue.authorizeObservation({title: "Inspect schema proposal", description: `Read schema proposal ${proposalId}.`});
    return proposal(row);
  }
}

/** Recompiles a saved proposal against the active XML schema before activation. */
export async function recompileProposal(db: D1Database, proposalId: string) {
  let row = await db.prepare("SELECT proposal_id, base_version, target_version, xml, breaking, status, created_at, updated_at FROM database_schema_proposals WHERE proposal_id = ?").bind(proposalId).first<ProposalRow>();
  if (!row) throw new Error("Schema proposal not found.");
  let store = new DatabaseStore(db), [schema, active] = await Promise.all([store.getSchema(), store.getModel()]);
  let compiled = compileSchema(active, mergeSchema(active, parseSchemaXml(row.xml)), schema.version + 1);
  return {record: proposal({...row, base_version: schema.version, target_version: schema.version + 1, breaking: compiled.breaking ? 1 : 0}), compiled, schema};
}
