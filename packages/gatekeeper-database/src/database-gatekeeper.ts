import {
  DurableObject,
  RpcStub as NativeRpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import { ActionJournal } from "@gadgets/gatekeeper-kit/actions";
import type {
  DatabaseData,
  DatabaseSchemaDesigner,
} from "@gadgets/workshop-shared/database";
import type {
  AccountDescription,
  ActionKind,
  AppUiContext,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  GatekeeperUiFrame,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import { DatabaseManagementApiImpl } from "./management.js";
import {
  DatabaseSchemaDesignerSession,
  recompileProposal,
} from "./schema-designer.js";
import { DatabaseDataSession } from "./sessions.js";
import { DatabaseStore } from "./store.js";
import DATABASE_APP_HTML from "./generated/app.txt";
import DATABASE_DATA_CONFIGURATOR_HTML from "./generated/database-data-configurator-ui.txt";
import DATABASE_SCHEMA_CONFIGURATOR_HTML from "./generated/database-schema-configurator-ui.txt";

const ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='currentColor'><path d='M128 16C75 16 32 34 32 56v144c0 22 43 40 96 40s96-18 96-40V56c0-22-43-40-96-40Z'/></svg>",
    ),
};
const DATA: SupportedResource = {
  urlPattern: "database://installation/data",
  title: "Data",
  description:
    "Run authorized SQLite SELECT and DML against installation data.",
  icon: ICON,
};
const SCHEMA: SupportedResource = {
  urlPattern: "database://installation/schema",
  title: "Schema",
  description:
    "Inspect and propose reviewed XML schema fragments. The binding's TypeScript contract includes the exact closed XML grammar and copyable examples.",
  icon: ICON,
};
class EmptyConfiguratorApi extends RpcTarget {}
export interface DatabaseVerifierApi extends GatekeeperUserVerifier {
  verifyInstallation(): Promise<void>;
}

/** Installation verifier shared by every account and resource connection. */
@validateRpc()
export class DatabaseVerifier
  extends WorkerEntrypoint<Cloudflare.Env>
  implements DatabaseVerifierApi
{
  async verifyInstallation(): Promise<void> {
    await new DatabaseStore(this.env.DATABASE).provision();
  }
}

/** Direct data resource. Its props carry only a random connection access-profile id. */
@validateRpc()
export class DatabaseDataGatekeeper
  extends DurableObject<Cloudflare.Env>
  implements Gatekeeper<DatabaseData>
{
  async describe(): Promise<ResourceDescription> {
    return {
      url: DATA.urlPattern,
      title: DATA.title,
      snippet: DATA.description,
      suggestedBindingName: "DATABASE_DATA",
      tsType: "DatabaseData",
    };
  }
  async getTypeScriptTypes(): Promise<string> {
    return DATA_TYPES;
  }
  async getAutoApprovableActions(): Promise<ActionKind[]> {
    return [];
  }
  async startSession(
    queue: NativeRpcStub<ApprovalQueue>,
  ): Promise<DatabaseData> {
    await new DatabaseStore(this.env.DATABASE).provision();
    return new DatabaseDataSession(
      this.env.DATABASE,
      (this.ctx.props as { profileId: string }).profileId,
      queue.dup(),
    );
  }
  async addObserver(
    _id: string,
    user: Fetcher<GatekeeperUserVerifier>,
  ): Promise<void> {
    await (
      user as unknown as Fetcher<DatabaseVerifierApi>
    ).verifyInstallation();
  }
  async removeObserver(_id: string): Promise<void> {}
  applyAction(): never {
    throw new Error("Database data writes are synchronous.");
  }
  rejectAction(): never {
    throw new Error("Database data writes are synchronous.");
  }
  revertAction(): never {
    throw new Error("Database data writes are synchronous.");
  }
}

/** Schema resource that awaits review in the Database management app. */
@validateRpc()
export class DatabaseSchemaGatekeeper
  extends DurableObject<Cloudflare.Env>
  implements Gatekeeper<DatabaseSchemaDesigner>
{
  private journal() {
    return new ActionJournal<{ proposalId: string }>(this.ctx.storage.kv);
  }
  async describe(): Promise<ResourceDescription> {
    return {
      url: SCHEMA.urlPattern,
      title: SCHEMA.title,
      snippet: SCHEMA.description,
      suggestedBindingName: "DATABASE_SCHEMA",
      tsType: "DatabaseSchemaDesigner",
    };
  }
  async getTypeScriptTypes(): Promise<string> {
    return SCHEMA_TYPES;
  }
  async getAutoApprovableActions(): Promise<ActionKind[]> {
    return [];
  }
  async startSession(
    queue: NativeRpcStub<ApprovalQueue>,
  ): Promise<DatabaseSchemaDesigner> {
    return new DatabaseSchemaDesignerSession(
      this.env.DATABASE,
      queue.dup(),
      this.journal(),
    );
  }
  async applyAction(action: number): Promise<void> {
    let record = this.journal().get(action);
    if (!record) throw new Error("Schema proposal action not found.");
    let row = await this.env.DATABASE.prepare(
      "SELECT base_version, status FROM database_schema_proposals WHERE proposal_id = ?",
    )
      .bind(record.action.proposalId)
      .first<{ base_version: number; status: string }>();
    if (row?.status !== "ready")
      throw new Error(
        "A deployment administrator must mark this proposal ready in the Database app first.",
      );
    let current = await new DatabaseStore(this.env.DATABASE).getSchema();
    if (row.base_version !== current.version) {
      await this.env.DATABASE.prepare(
        "UPDATE database_schema_proposals SET status = 'stale', updated_at = ? WHERE proposal_id = ? AND status = 'ready'",
      )
        .bind(new Date().toISOString(), record.action.proposalId)
        .run();
      throw new Error(
        "The approved proposal is stale; revalidate it in the Database app.",
      );
    }
    let {
      record: proposal,
      compiled,
      schema,
    } = await recompileProposal(this.env.DATABASE, record.action.proposalId);
    if (proposal.status !== "ready")
      throw new Error("Schema proposal is no longer ready.");
    let now = new Date().toISOString();
    await this.env.DATABASE.batch([
      ...compiled.statements.map((sql) => this.env.DATABASE.prepare(sql)),
      this.env.DATABASE.prepare(
        "INSERT INTO database_schemas (version, schema_xml, activated_at) VALUES (?, ?, ?)",
      ).bind(proposal.targetVersion, compiled.schema.xml, now),
      this.env.DATABASE.prepare(
        "UPDATE installation_database SET active_schema_version = ?, active_schema_xml = ? WHERE singleton = 1 AND active_schema_version = ?",
      ).bind(proposal.targetVersion, compiled.schema.xml, schema.version),
      this.env.DATABASE.prepare(
        "UPDATE database_schema_proposals SET status = 'active', compiled_json = ?, activated_at = ?, updated_at = ? WHERE proposal_id = ? AND status = 'ready'",
      ).bind(JSON.stringify(compiled), now, now, proposal.id),
    ]);
    this.journal().retain(action);
  }
  async rejectAction(action: number): Promise<void> {
    let record = this.journal().get(action);
    if (record)
      await this.env.DATABASE.prepare(
        "UPDATE database_schema_proposals SET status = 'rejected', updated_at = ? WHERE proposal_id = ? AND status != 'active'",
      )
        .bind(new Date().toISOString(), record.action.proposalId)
        .run();
    this.journal().remove(action);
  }
  revertAction(): never {
    throw new Error(
      "Schema activation cannot be reverted through the approval action.",
    );
  }
  async addObserver(
    _id: string,
    user: Fetcher<GatekeeperUserVerifier>,
  ): Promise<void> {
    await (
      user as unknown as Fetcher<DatabaseVerifierApi>
    ).verifyInstallation();
  }
  async removeObserver(_id: string): Promise<void> {}
}

/** Auto-provisioned account exposing ordinary connectable data and schema resources plus the app. */
@validateRpc()
export class DatabaseAccount
  extends WorkerEntrypoint<Cloudflare.Env>
  implements GatekeeperUser
{
  async describe(): Promise<AccountDescription> {
    return {
      displayName: "Database",
      avatar: ICON,
      providesUi: { title: "Database", icon: ICON },
    };
  }
  async getSingletonGatekeeperClass(): Promise<
    DurableObjectClass<Gatekeeper<never>>
  > {
    throw new Error("Database has no ambient singleton.");
  }
  async startAppUi(context: AppUiContext): Promise<GatekeeperUiFrame> {
    await new DatabaseStore(this.env.DATABASE).provision();
    return {
      iframeHtml: DATABASE_APP_HTML,
      ui: new NativeRpcStub(new DatabaseManagementApiImpl(this.env, context)),
    };
  }
  async getSupportedResources(): Promise<SupportedResource[]> {
    return [DATA, SCHEMA];
  }
  async getGatekeeperClassFor(url: string) {
    if (url === DATA.urlPattern)
      return {
        class: this.ctx.exports.DatabaseDataGatekeeper({
          props: { profileId: crypto.randomUUID() },
        }),
        resource: DATA,
      };
    if (url === SCHEMA.urlPattern)
      return {
        class: this.ctx.exports.DatabaseSchemaGatekeeper({ props: {} }),
        resource: SCHEMA,
      };
    throw new Error("Unsupported Database resource.");
  }
  async startResourceConfigurator(
    pattern: string,
  ): Promise<ResourceConfiguratorFrame> {
    if (pattern !== DATA.urlPattern && pattern !== SCHEMA.urlPattern)
      throw new Error("Unsupported Database resource configurator.");
    return {
      iframeHtml:
        pattern === DATA.urlPattern
          ? DATABASE_DATA_CONFIGURATOR_HTML
          : DATABASE_SCHEMA_CONFIGURATOR_HTML,
      ui: new NativeRpcStub(new EmptyConfiguratorApi()),
    };
  }
  async ensureResources(_patterns: string[]): Promise<{ url?: string }> {
    return {};
  }
  async revoke(): Promise<void> {
    throw new Error(
      "Database account deletion requires installation administration.",
    );
  }
  reconnect(): Promise<{ url: string }> {
    throw new Error("Database has no connect flow.");
  }
  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }
  @skipRpcValidation() async getVerifier(): Promise<
    Fetcher<GatekeeperUserVerifier>
  > {
    return this.ctx.exports.DatabaseVerifier({ props: {} });
  }
}

/** Database vendor entrypoint. */
@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "Database",
      url: "https://workers.cloudflare.com/",
      logo: ICON,
      tagline: "Shared installation data",
      description:
        "One installation-wide D1 database with reviewed XML schemas.",
      autoProvisionsAccount: true,
      providesAuth: false,
    };
  }
  @skipRpcValidation() async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.DatabaseAccount({
      props: {},
    }) as unknown as Fetcher<GatekeeperUser>;
  }
  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("Database is auto-provisioned and has no connect flow.");
  }
  async getSupportedResources(): Promise<SupportedResource[]> {
    return [DATA, SCHEMA];
  }
  async getTypeScriptTypes(): Promise<string> {
    return `${DATA_TYPES}\n${SCHEMA_TYPES}`;
  }
}
const DATA_TYPES = `/**
 * Read and query the installation database from executeCode:
 *
 * export default async function(self, env, ctx) {
 *   const schema = await env.DATABASE_DATA.getSchema();
 *   const rows = await env.DATABASE_DATA.run("SELECT * FROM customers WHERE id = ?", [1]);
 *   const results = await env.DATABASE_DATA.batch([
 *     {sql: "SELECT * FROM customers LIMIT ?", params: [10]},
 *     {sql: "SELECT COUNT(*) AS count FROM customers"},
 *   ]);
 *   console.log(schema.xml, rows.results, results);
 * }
 */
interface DatabaseSchemaFormat { language: "database-schema-xml/v1"; guide: string; examples: {create: string; extend: string; renameAndConvert: string; retire: string}; }
interface DatabaseSchema { version: number; xml: string; format: DatabaseSchemaFormat; }
interface DatabaseData { run(sql: string, params?: Array<string | number | boolean | Uint8Array | null>): Promise<{results: Record<string, unknown>[]; meta: Record<string, unknown>}>; batch(statements: Array<{sql: string; params?: Array<string | number | boolean | Uint8Array | null>}>): Promise<Array<{results: Record<string, unknown>[]; meta: Record<string, unknown>}>>; /** Returns the active XML and its grammar/examples. */ getSchema(): Promise<DatabaseSchema>; }`;
const SCHEMA_TYPES = `/**
 * Proposes changes to the installation schema. Read this format guide before
 * calling proposeSchema: this is a closed XML grammar, not SQL or a guessed
 * object model. getSchema() returns the canonical active XML plus its runtime
 * grammar and copyable examples; call it before proposing a fragment.
 *
 * export default async function(self, env, ctx) {
 *   const current = await env.DATABASE_SCHEMA.getSchema();
 *   const proposal = await env.DATABASE_SCHEMA.proposeSchema(
 *     '<schema summary="Add notes"><table name="customers"><column name="notes" type="text"/></table></schema>'
 *   );
 *   console.log(current.version, proposal);
 * }
 *
 * Root: <schema summary="brief change summary">...</schema>
 * Names: lowercase business identifiers ([a-z][a-z0-9_]{0,62}); sqlite_* and
 * __gadgets_* are reserved. No namespaces, DTDs, entities, or unknown
 * elements/attributes. Omission leaves an existing object unchanged.
 *
 * Table: <table name="customers" rename-from="old_customers" disabled="true">
 * Column: <column name="email" type="text" nullable="false" default="guest"
 *                 autoincrement="true" rename-from="old_email" conversion="identity" disabled="true"/>
 * Types: text, integer, real, boolean, date, datetime, decimal, json, binary.
 * nullable defaults to true. autoincrement requires a non-null integer primary
 * key with no default. Boolean attributes accept only true or false.
 * A rename or type conversion is breaking. Supported conversions are identity,
 * integer_to_text, real_to_text, text_to_integer, text_to_real,
 * boolean_to_integer, and integer_to_boolean.
 *
 * Index: <index name="customers_email_lookup" columns="email" unique="true"
 *               disabled="true"/>
 * Constraint forms:
 *   <constraint name="customers_pk" type="primary" columns="id"/>
 *   <constraint name="customers_email_unique" type="unique" columns="email"/>
 *   <constraint name="orders_customer_fk" type="foreign-key" columns="customer_id"
 *               ref-table="customers" ref-columns="id" on-delete="cascade"/>
 *   <constraint name="orders_ref_restrict" type="foreign-key" columns="referrer_id"
 *               ref-table="customers" ref-columns="id" on-delete="restrict"/>
 *   <constraint name="customers_score_bound" type="check" columns="score"
 *               operator="gte" value="0"/>
 *   <constraint name="customers_status_enum" type="enum" columns="status"
 *               values="draft,active,disabled"/>
 * Check operators: eq, ne, lt, lte, gt, gte. Constraint/index/table/column
 * retirement uses disabled="true". A proposal may contain up to 300 normalized
 * changes. It is saved and then waits for deployment-admin review.
 *
 * Create:
 * <schema summary="Add customers"><table name="customers"><column name="id" type="integer" nullable="false"/><column name="email" type="text" nullable="false"/><column name="enabled" type="boolean" default="true"/><constraint name="customers_pk" type="primary" columns="id"/></table></schema>
 *
 * Extend:
 * <schema summary="Add customer details"><table name="customers"><column name="score" type="real"/><column name="birthday" type="date"/><column name="last_seen" type="datetime"/><column name="credit" type="decimal" default="0"/><column name="preferences" type="json"/><column name="avatar" type="binary"/><index name="customers_score_lookup" columns="score" unique="true"/></table></schema>
 *
 * Rename / convert:
 * <schema summary="Rename email"><table name="customers"><column name="email_address" type="text" rename-from="email" conversion="identity"/></table></schema>
 *
 * Retire:
 * <schema summary="Retire avatar"><table name="customers"><column name="avatar" type="binary" disabled="true"/></table></schema>
 */
interface DatabaseSchemaFormat { language: "database-schema-xml/v1"; guide: string; examples: {create: string; extend: string; renameAndConvert: string; retire: string}; }
interface DatabaseSchema { version: number; xml: string; format: DatabaseSchemaFormat; }
interface DatabaseSchemaDesigner { /** Read the active XML and required format/examples before proposing. */ getSchema(): Promise<DatabaseSchema>; proposeSchema(xml: string): Promise<{id: string; baseVersion: number; targetVersion: number; breaking: boolean; status: string}>; getProposal(id: string): Promise<{id: string; xml: string; status: string}>; }`;
