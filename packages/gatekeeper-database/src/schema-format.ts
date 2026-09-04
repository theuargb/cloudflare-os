import type { DatabaseSchemaFormat } from "@gadgets/workshop-shared/database";

/** The one agent-facing definition of the closed database schema XML grammar. */
export const DATABASE_SCHEMA_FORMAT: DatabaseSchemaFormat = {
  language: "database-schema-xml/v1",
  guide: `Submit one <schema summary="brief change summary"> fragment. Start from the xml returned by getSchema(); it is the canonical active schema. Omitted tables, columns, indexes, and constraints remain unchanged. Names must match [a-z][a-z0-9_]{0,62}; sqlite_* and __gadgets_* are reserved. DTDs, entities, namespaces, unknown elements, and unknown attributes are rejected.\n\nRoot: <schema summary="…">. It contains <table name="…" rename-from="…" disabled="true">. A table contains self-closing <column>, <index>, and <constraint> elements.\n\nColumn: <column name="…" type="text|integer|real|boolean|date|datetime|decimal|json|binary" nullable="true|false" default="…" autoincrement="true" rename-from="…" conversion="…" disabled="true"/>. nullable defaults to true. autoincrement is SQLite AUTOINCREMENT: it requires exactly one non-null integer primary-key column, with no default. Supported conversions: identity, integer_to_text, real_to_text, text_to_integer, text_to_real, boolean_to_integer, integer_to_boolean. A rename or conversion is breaking.\n\nIndex: <index name="…" columns="column_a,column_b" unique="true|false" disabled="true"/>. Constraint: primary or unique uses name, type, columns; foreign-key also needs ref-table, ref-columns, and optional on-delete="cascade|restrict"; check also needs operator="eq|ne|lt|lte|gt|gte" and value="…"; enum uses one column and values="draft,published" and compiles to a SQLite CHECK IN constraint. Use disabled="true" to retire a declared table, column, index, or constraint. A proposal may contain at most 300 normalized changes. proposeSchema() saves the fragment and waits for deployment-admin review.`,
  examples: {
    create: `<schema summary="Add customers">
  <table name="customers">
    <column name="id" type="integer" nullable="false" autoincrement="true"/>
    <column name="email" type="text" nullable="false"/>
    <column name="enabled" type="boolean" default="true"/>
    <column name="status" type="text" default="draft"/>
    <constraint name="customers_pk" type="primary" columns="id"/>
    <constraint name="customers_email_unique" type="unique" columns="email"/>
    <constraint name="customers_status_enum" type="enum" columns="status" values="draft,active,disabled"/>
    <index name="customers_enabled" columns="enabled"/>
    <index name="customers_email_lookup" columns="email" unique="true"/>
  </table>
</schema>`,
    extend: `<schema summary="Add customer details">
  <table name="customers">
    <column name="score" type="real"/>
    <column name="birthday" type="date"/>
    <column name="last_seen" type="datetime"/>
    <column name="credit" type="decimal" default="0"/>
    <column name="preferences" type="json"/>
    <column name="avatar" type="binary"/>
    <constraint name="customers_score_bound" type="check" columns="score" operator="gte" value="0"/>
  </table>
</schema>`,
    renameAndConvert: `<schema summary="Add orders and rename email">
  <table name="orders">
    <column name="id" type="integer" nullable="false"/>
    <column name="customer_id" type="integer" nullable="false"/>
    <column name="referrer_id" type="integer"/>
    <constraint name="orders_pk" type="primary" columns="id"/>
    <constraint name="orders_customer_fk" type="foreign-key" columns="customer_id" ref-table="customers" ref-columns="id" on-delete="cascade"/>
    <constraint name="orders_referrer_fk" type="foreign-key" columns="referrer_id" ref-table="customers" ref-columns="id" on-delete="restrict"/>
  </table>
  <table name="customers">
    <column name="email_address" type="text" rename-from="email" conversion="identity"/>
  </table>
</schema>`,
    retire: `<schema summary="Retire obsolete avatar">
  <table name="customers">
    <column name="avatar" type="binary" disabled="true"/>
    <index name="customers_enabled" columns="enabled" disabled="true"/>
  </table>
  <table name="legacy_imports" disabled="true"/>
</schema>`,
  },
};
