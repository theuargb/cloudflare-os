/** A value accepted by SQLite parameter binding. */
export type DatabaseValue = string | number | boolean | Uint8Array | null;

/** One SQL statement and its optional positional parameters. */
export type DatabaseStatement = {
  /** A single SQLite SELECT, INSERT, UPDATE, or DELETE statement. */
  sql: string;
  /** Values bound to the statement's positional parameters. */
  params?: DatabaseValue[];
};

/** The D1 result returned after running one statement. */
export type DatabaseResult = {
  /** Rows produced by SELECT or RETURNING. */
  results: Record<string, DatabaseValue>[];
  /** D1 metadata, without a product-level result limit. */
  meta: { changes: number; duration: number; [key: string]: unknown };
};

/** The active installation schema. */
export type DatabaseSchema = {
  /** Monotonically increasing active schema version. */
  version: number;
  /** Canonical, merged XML representation of the active schema. */
  xml: string;
  /** Closed XML grammar and copyable examples for extending `xml`. */
  format: DatabaseSchemaFormat;
};

/** Agent-readable grammar and examples returned with every schema inspection. */
export type DatabaseSchemaFormat = {
  /** Stable identifier for this XML fragment grammar. */
  language: "database-schema-xml/v1";
  /** Rules that apply to every submitted schema fragment. */
  guide: string;
  /** Copyable fragments for the common schema-change operations. */
  examples: {
    create: string;
    extend: string;
    renameAndConvert: string;
    retire: string;
  };
};

/** Connectable data resource for one installation-wide D1 database. */
export interface DatabaseData {
  /** Runs one authorized SQLite SELECT, INSERT, UPDATE, or DELETE statement. */
  run(sql: string, params?: DatabaseValue[]): Promise<DatabaseResult>;
  /** Runs authorized statements as one ordered, atomic D1 batch. */
  batch(statements: DatabaseStatement[]): Promise<DatabaseResult[]>;
  /** Returns the active version and canonical XML schema. */
  getSchema(): Promise<DatabaseSchema>;
}

/** Connectable schema resource for proposing reviewed XML schema changes. */
export interface DatabaseSchemaDesigner {
  /** Returns the active version and canonical XML schema. */
  getSchema(): Promise<DatabaseSchema>;
  /** Saves and submits an XML schema fragment for deployment-admin review. */
  proposeSchema(xml: string): Promise<DatabaseSchemaProposal>;
  /** Reloads one editable proposal. */
  getProposal(id: string): Promise<DatabaseSchemaProposal>;
}

/** Editable reviewed schema proposal. */
export type DatabaseSchemaProposal = {
  /** Stable random proposal identifier. */
  id: string;
  /** Active schema version used to compile this revision. */
  baseVersion: number;
  /** Version that activation would create. */
  targetVersion: number;
  /** Submitted XML fragment. */
  xml: string;
  /** Whether the compiled change retires, renames, or converts schema objects. */
  breaking: boolean;
  /** Proposal lifecycle state. */
  status: "pending" | "ready" | "active" | "rejected" | "stale";
  /** Creation time in ISO-8601 form. */
  createdAt: string;
  /** Most recent edit time in ISO-8601 form. */
  updatedAt: string;
};
