import { WorkerEntrypoint } from "cloudflare:workers";
import type { VendorDescription } from "@gadgets/workshop-shared/gatekeeper";

interface Env { DATABASE: D1Database }

const PLATFORM_DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS installation_database (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), active_schema_version INTEGER NOT NULL, active_schema_xml TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS database_schemas (version INTEGER PRIMARY KEY, schema_xml TEXT NOT NULL, activated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS database_schema_proposals (proposal_id TEXT PRIMARY KEY, base_version INTEGER NOT NULL, target_version INTEGER NOT NULL, xml TEXT NOT NULL, compiled_json TEXT NOT NULL, breaking INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'active', 'rejected', 'stale')), review_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, activated_at TEXT);
CREATE TABLE IF NOT EXISTS database_access_profiles (profile_id TEXT PRIMARY KEY, configured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS database_access_grants (profile_id TEXT NOT NULL REFERENCES database_access_profiles(profile_id) ON DELETE CASCADE, table_name TEXT NOT NULL, column_name TEXT, permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'table-write')), PRIMARY KEY (profile_id, table_name, column_name, permission));
CREATE TABLE IF NOT EXISTS database_audit_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT, operation TEXT NOT NULL, tables_json TEXT NOT NULL, schema_version INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS database_audit_time ON database_audit_events(created_at DESC);
CREATE TABLE IF NOT EXISTS database_domain_schema_requests (domain_id TEXT NOT NULL, schema_sha256 TEXT NOT NULL, proposal_id TEXT NOT NULL REFERENCES database_schema_proposals(proposal_id) ON DELETE CASCADE, requested_at TEXT NOT NULL, PRIMARY KEY (domain_id, schema_sha256));
CREATE INDEX IF NOT EXISTS database_domain_schema_requests_proposal ON database_domain_schema_requests(proposal_id);
CREATE TABLE IF NOT EXISTS database_action_receipts (profile_id TEXT NOT NULL, action_id INTEGER NOT NULL, committed_at TEXT NOT NULL, PRIMARY KEY (profile_id, action_id));
`;

/** Test-only platform setup for the real Database and HR workers in this harness. */
export class GatekeeperVendor extends WorkerEntrypoint<Env> {
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "HR integration database bootstrap",
      url: "https://integration.invalid/",
      logo: { url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" },
      tagline: "Test-only database initialization",
      description: "Initializes the local D1 metadata tables required by the real Database worker.",
      autoProvisionsAccount: false,
      providesAuth: false,
    };
  }
  async getSupportedResources() { return []; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/__test/bootstrap")
      return new Response("Not found", { status: 404 });
    await env.DATABASE.exec(PLATFORM_DDL);
    return new Response(null, { status: 204 });
  },
};
