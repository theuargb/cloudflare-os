import type { DatabaseSchema } from "@gadgets/workshop-shared/database";
import { canonicalXml, parseSchemaXml, type XmlModel } from "./xml-schema.js";
import { DATABASE_SCHEMA_FORMAT } from "./schema-format.js";

/** D1-backed authority for the installation-wide database metadata. */
export class DatabaseStore {
  constructor(readonly db: D1Database) {}

  /** Creates metadata for a fresh installation, or returns the current schema. */
  async provision(): Promise<DatabaseSchema> {
    let row = await this.db
      .prepare(
        "SELECT active_schema_version, active_schema_xml FROM installation_database WHERE singleton = 1",
      )
      .first<{ active_schema_version: number; active_schema_xml: string }>();
    if (row)
      return {
        version: row.active_schema_version,
        xml: row.active_schema_xml,
        format: DATABASE_SCHEMA_FORMAT,
      };
    let createdAt = new Date().toISOString(),
      xml = canonicalXml({ summary: "Installation database", tables: [] });
    await this.db.batch([
      this.db
        .prepare(
          "INSERT OR IGNORE INTO installation_database (singleton, active_schema_version, active_schema_xml, created_at) VALUES (1, 1, ?, ?)",
        )
        .bind(xml, createdAt),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO database_schemas (version, schema_xml, activated_at) VALUES (1, ?, ?)",
        )
        .bind(xml, createdAt),
    ]);
    return { version: 1, xml, format: DATABASE_SCHEMA_FORMAT };
  }

  /** Reads the active canonical XML schema. */
  async getSchema(): Promise<DatabaseSchema> {
    return this.provision();
  }

  /** Parses the active schema only after initialization has completed. */
  async getModel(): Promise<XmlModel> {
    return parseSchemaXml((await this.provision()).xml);
  }
}
