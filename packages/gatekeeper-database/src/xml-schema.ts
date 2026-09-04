import type { DatabaseSchema } from "@gadgets/workshop-shared/database";
import { DATABASE_SCHEMA_FORMAT } from "./schema-format.js";

export type ScalarType =
  | "text"
  | "integer"
  | "real"
  | "boolean"
  | "date"
  | "datetime"
  | "decimal"
  | "json"
  | "binary";
type Column = {
  name: string;
  type: ScalarType;
  nullable: boolean;
  defaultValue?: string;
  renameFrom?: string;
  disabled?: boolean;
  conversion?: string;
  autoIncrement?: boolean;
};
type Index = {
  name: string;
  columns: string[];
  unique: boolean;
  disabled?: boolean;
};
type Constraint = {
  name: string;
  type: "primary" | "unique" | "foreign-key" | "check" | "enum";
  columns: string[];
  refTable?: string;
  refColumns?: string[];
  onDelete?: "cascade" | "restrict";
  operator?: string;
  value?: string;
  values?: string[];
  disabled?: boolean;
};
type Table = {
  name: string;
  columns: Column[];
  indexes: Index[];
  constraints: Constraint[];
  renameFrom?: string;
  disabled?: boolean;
};
export type XmlModel = { summary: string; tables: Table[] };

const TYPES = new Set<ScalarType>([
  "text",
  "integer",
  "real",
  "boolean",
  "date",
  "datetime",
  "decimal",
  "json",
  "binary",
]);
const CONVERSIONS = new Set([
  "identity",
  "integer_to_text",
  "real_to_text",
  "text_to_integer",
  "text_to_real",
  "boolean_to_integer",
  "integer_to_boolean",
]);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const INTERNAL = /^(?:sqlite_|__gadgets_)/;
const attrs = /([a-z-]+)="([^"]*)"/g;

function fail(message: string): never {
  throw new Error(`Invalid database schema XML: ${message}`);
}
function name(value: string | undefined, label: string): string {
  if (!value || !IDENTIFIER.test(value) || INTERNAL.test(value))
    fail(`${label} must be a lowercase business identifier.`);
  return value;
}
function tagAttributes(source: string): Record<string, string> {
  let result: Record<string, string> = {},
    consumed: string[] = [],
    match: RegExpExecArray | null;
  while ((match = attrs.exec(source))) {
    consumed.push(match[0]!);
    result[match[1]!] = match[2]!
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  }
  let reconstructed = consumed.join(" ");
  if (source.trim() && reconstructed !== source.trim())
    fail("attributes must be quoted and known.");
  return result;
}
function allowed(
  value: Record<string, string>,
  keys: string[],
  element: string,
): void {
  for (let key of Object.keys(value))
    if (!keys.includes(key)) fail(`${element} has unknown attribute ${key}.`);
}
function bool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  if (value !== "true" && value !== "false")
    fail("boolean attributes must be true or false.");
  return value === "true";
}
function csv(value: string | undefined, label: string): string[] {
  if (!value) fail(`${label} is required.`);
  let values = value.split(",");
  if (!values.length || new Set(values).size !== values.length)
    fail(`${label} contains duplicates.`);
  return values.map((item) => name(item, label));
}
function enumValues(value: string | undefined): string[] {
  if (!value) fail("enum values is required.");
  let values = value.split(",").map((item) => item.trim());
  if (values.some((item) => !item) || new Set(values).size !== values.length)
    fail("enum values must be distinct non-empty comma-separated literals.");
  return values;
}

/** Parses the closed, namespace-free schema fragment grammar. */
export function parseSchemaXml(xml: string): XmlModel {
  if (typeof xml !== "string" || xml.length > 500_000)
    fail("document is missing or too large.");
  if (/<!|&(?!amp;|apos;|quot;|lt;|gt;)|xmlns(?::|=)/i.test(xml))
    fail("DTDs, entities, and namespaces are not allowed.");
  let root = /^\s*<schema\s+([^>]*)>([\s\S]*)<\/schema>\s*$/.exec(xml);
  if (!root) fail('root must be <schema summary="…">.');
  let rootAttrs = tagAttributes(root[1]!);
  allowed(rootAttrs, ["summary"], "schema");
  if (!rootAttrs.summary?.trim()) fail("schema summary is required.");
  let tables: Table[] = [],
    tableMatcher = /<table\s+([^>]*)(?:\/>|>([\s\S]*?)<\/table>)/g,
    match: RegExpExecArray | null;
  let consumed = "";
  while ((match = tableMatcher.exec(root[2]!))) {
    consumed += match[0];
    let a = tagAttributes(match[1]!);
    allowed(a, ["name", "rename-from", "disabled"], "table");
    let table: Table = {
      name: name(a.name, "table name"),
      columns: [],
      indexes: [],
      constraints: [],
      renameFrom: a["rename-from"],
      disabled: bool(a.disabled),
    };
    if (table.renameFrom) name(table.renameFrom, "table rename-from");
    let body = match[2] ?? "";
    let child = /<(column|index|constraint)\s+([^>]*)\/>/g,
      part: RegExpExecArray | null;
    while ((part = child.exec(body))) {
      let b = tagAttributes(part[2]!);
      if (part[1] === "column") {
        allowed(
          b,
          [
            "name",
            "type",
            "nullable",
            "default",
            "rename-from",
            "disabled",
            "conversion",
            "autoincrement",
          ],
          "column",
        );
        let type = b.type as ScalarType;
        if (!TYPES.has(type)) fail("column type is unsupported.");
        let column: Column = {
          name: name(b.name, "column name"),
          type,
          nullable: bool(b.nullable, true),
          defaultValue: b.default,
          renameFrom: b["rename-from"],
          disabled: bool(b.disabled),
          conversion: b.conversion,
          autoIncrement: bool(b.autoincrement),
        };
        if (column.renameFrom) name(column.renameFrom, "column rename-from");
        table.columns.push(column);
        if (column.conversion && !CONVERSIONS.has(column.conversion))
          fail("column conversion is unsupported.");
        if (column.autoIncrement && column.type !== "integer")
          fail("autoincrement requires an integer column.");
      } else if (part[1] === "index") {
        allowed(b, ["name", "columns", "unique", "disabled"], "index");
        table.indexes.push({
          name: name(b.name, "index name"),
          columns: csv(b.columns, "index columns"),
          unique: bool(b.unique),
          disabled: bool(b.disabled),
        });
      } else {
        allowed(
          b,
          [
            "name",
            "type",
            "columns",
            "ref-table",
            "ref-columns",
            "on-delete",
            "operator",
            "value",
            "values",
            "disabled",
          ],
          "constraint",
        );
        let type = b.type as Constraint["type"];
        if (
          !(
            ["primary", "unique", "foreign-key", "check", "enum"] as string[]
          ).includes(type)
        )
          fail("constraint type is unsupported.");
        let constraint: Constraint = {
          name: name(b.name, "constraint name"),
          type,
          columns: csv(b.columns, "constraint columns"),
          disabled: bool(b.disabled),
        };
        if (type === "foreign-key") {
          constraint.refTable = name(b["ref-table"], "ref-table");
          constraint.refColumns = csv(b["ref-columns"], "ref-columns");
          if (constraint.refColumns.length !== constraint.columns.length)
            fail("foreign-key columns must match ref-columns.");
          if (
            b["on-delete"] &&
            b["on-delete"] !== "cascade" &&
            b["on-delete"] !== "restrict"
          )
            fail("on-delete is invalid.");
          constraint.onDelete = b["on-delete"] as
            | "cascade"
            | "restrict"
            | undefined;
        }
        if (type === "check") {
          if (
            !b.operator ||
            b.value === undefined ||
            !["eq", "ne", "lt", "lte", "gt", "gte"].includes(b.operator)
          )
            fail("check requires supported operator and value.");
          constraint.operator = b.operator;
          constraint.value = b.value;
        }
        if (type === "enum") {
          if (constraint.columns.length !== 1)
            fail("enum constraints require one column.");
          constraint.values = enumValues(b.values);
        }
        table.constraints.push(constraint);
      }
    }
    if (body.replace(child, "").trim())
      fail("table contains an unknown or non-empty element.");
    tables.push(table);
  }
  if (root[2]!.replace(tableMatcher, "").trim())
    fail("schema contains an unknown element.");
  return { summary: rootAttrs.summary.trim(), tables };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
function mergeByName<T extends { name: string }>(
  base: T[],
  patch: T[],
  label: string,
): T[] {
  let out = clone(base),
    seen = new Set<string>();
  for (let item of patch) {
    if (seen.has(item.name)) fail(`duplicate ${label} declarations conflict.`);
    seen.add(item.name);
    let index = out.findIndex((existing) => existing.name === item.name);
    if (index >= 0) {
      if (JSON.stringify(out[index]) !== JSON.stringify(item))
        fail(`duplicate ${label} declarations conflict.`);
    } else out.push(item);
  }
  return out;
}

/** Merges a fragment into the active model; omitted objects remain unchanged. */
export function mergeSchema(active: XmlModel, fragment: XmlModel): XmlModel {
  let out = clone(active);
  out.summary = fragment.summary;
  for (let next of fragment.tables) {
    let target = next.renameFrom ?? next.name,
      index = out.tables.findIndex(
        (table) => table.name === target || table.name === next.name,
      );
    if (next.disabled) {
      if (index < 0) fail(`cannot retire unknown table ${next.name}.`);
      out.tables.splice(index, 1);
      continue;
    }
    if (index < 0) {
      out.tables.push(next);
      continue;
    }
    let old = out.tables[index]!;
    let table: Table = {
      ...old,
      ...next,
      name: next.name,
      columns: mergeByName(
        old.columns,
        next.columns.filter((column) => !column.disabled),
        "column",
      ),
      indexes: mergeByName(
        old.indexes,
        next.indexes.filter((index) => !index.disabled),
        "index",
      ),
      constraints: mergeByName(
        old.constraints,
        next.constraints.filter((constraint) => !constraint.disabled),
        "constraint",
      ),
    };
    for (let retired of next.columns.filter((column) => column.disabled))
      table.columns = table.columns.filter(
        (column) =>
          column.name !== retired.name && column.name !== retired.renameFrom,
      );
    for (let index of next.indexes.filter((index) => index.disabled))
      table.indexes = table.indexes.filter(
        (existing) => existing.name !== index.name,
      );
    for (let constraint of next.constraints.filter(
      (constraint) => constraint.disabled,
    ))
      table.constraints = table.constraints.filter(
        (existing) => existing.name !== constraint.name,
      );
    out.tables[index] = table;
  }
  return out;
}

function q(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
function sqliteType(type: ScalarType): string {
  return type === "integer" || type === "boolean"
    ? "INTEGER"
    : type === "real"
      ? "REAL"
      : type === "binary"
        ? "BLOB"
        : "TEXT";
}
function defaultSql(value: string): string {
  if (value === "null") return "NULL";
  if (value === "true") return "1";
  if (value === "false") return "0";
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}
function autoIncrementColumn(table: Table): Column | undefined {
  let columns = table.columns.filter(
    (column) => column.autoIncrement && !column.disabled,
  );
  if (columns.length > 1)
    throw new Error("A table may have only one autoincrement column.");
  let column = columns[0];
  if (!column) return undefined;
  let primary = table.constraints.find(
    (constraint) =>
      constraint.type === "primary" &&
      constraint.columns.length === 1 &&
      constraint.columns[0] === column.name,
  );
  if (
    column.type !== "integer" ||
    column.nullable ||
    column.defaultValue !== undefined ||
    !primary
  )
    throw new Error(
      "An autoincrement column must be a non-null integer primary key with no default.",
    );
  return column;
}
function columnSql(column: Column, autoIncrement = false): string {
  return `${q(column.name)} ${sqliteType(column.type)}${autoIncrement ? " PRIMARY KEY AUTOINCREMENT" : column.nullable ? "" : " NOT NULL"}${column.defaultValue === undefined ? "" : ` DEFAULT ${defaultSql(column.defaultValue)}`}`;
}
function tableSql(table: Table): string {
  let autoIncrement = autoIncrementColumn(table);
  let definitions = [
    ...table.columns.map((column) =>
      columnSql(column, column === autoIncrement),
    ),
    ...table.constraints
      .filter(
        (constraint) =>
          !(
            autoIncrement &&
            constraint.type === "primary" &&
            constraint.columns.length === 1 &&
            constraint.columns[0] === autoIncrement.name
          ),
      )
      .map((constraint) => {
        let columns = constraint.columns.map(q).join(", ");
        if (constraint.type === "primary")
          return `CONSTRAINT ${q(constraint.name)} PRIMARY KEY (${columns})`;
        if (constraint.type === "unique")
          return `CONSTRAINT ${q(constraint.name)} UNIQUE (${columns})`;
        if (constraint.type === "foreign-key")
          return `CONSTRAINT ${q(constraint.name)} FOREIGN KEY (${columns}) REFERENCES ${q(constraint.refTable!)} (${constraint.refColumns!.map(q).join(", ")}) ON DELETE ${(constraint.onDelete ?? "restrict").toUpperCase()}`;
        if (constraint.type === "enum")
          return `CONSTRAINT ${q(constraint.name)} CHECK (${q(constraint.columns[0]!)} IN (${constraint.values!.map((value) => defaultSql(value)).join(", ")}))`;
        let ops: Record<string, string> = {
          eq: "=",
          ne: "!=",
          lt: "<",
          lte: "<=",
          gt: ">",
          gte: ">=",
        };
        return `CONSTRAINT ${q(constraint.name)} CHECK (${q(constraint.columns[0]!)} ${ops[constraint.operator!]!} ${constraint.value})`;
      }),
  ];
  return `CREATE TABLE ${q(table.name)} (${definitions.join(", ")})`;
}
function convertedColumn(column: Column, prior: Column): string {
  let source = q(prior.name),
    conversion = column.conversion ?? "identity";
  let expected = new Map<string, [ScalarType, ScalarType]>([
    ["integer_to_text", ["integer", "text"]],
    ["real_to_text", ["real", "text"]],
    ["text_to_integer", ["text", "integer"]],
    ["text_to_real", ["text", "real"]],
    ["boolean_to_integer", ["boolean", "integer"]],
    ["integer_to_boolean", ["integer", "boolean"]],
  ]);
  let types = expected.get(conversion);
  if (types && (prior.type !== types[0] || column.type !== types[1]))
    throw new Error(
      "Schema conversion does not match the source and target column types.",
    );
  if (conversion === "identity" && prior.type !== column.type)
    throw new Error("Changing a column type requires a declared conversion.");
  if (conversion === "identity") return source;
  if (conversion === "integer_to_text" || conversion === "real_to_text")
    return `CAST(${source} AS TEXT)`;
  if (conversion === "text_to_integer" || conversion === "boolean_to_integer")
    return `CAST(${source} AS INTEGER)`;
  if (conversion === "text_to_real") return `CAST(${source} AS REAL)`;
  if (conversion === "integer_to_boolean")
    return `CASE WHEN ${source} = 0 THEN 0 ELSE 1 END`;
  throw new Error("Unsupported schema conversion.");
}

/** Produces deterministic DDL and the canonical target XML. */
export function compileSchema(
  active: XmlModel,
  next: XmlModel,
  version: number,
): {
  schema: DatabaseSchema;
  statements: string[];
  revert: string[];
  breaking: boolean;
  normalizedChanges: number;
} {
  for (let table of next.tables) autoIncrementColumn(table);
  let statements: string[] = [],
    revert: string[] = [],
    breaking = false;
  for (let old of active.tables)
    if (
      !next.tables.some(
        (table) => table.name === old.name || table.renameFrom === old.name,
      )
    ) {
      statements.push(`DROP TABLE ${q(old.name)}`);
      revert.unshift(tableSql(old));
      breaking = true;
    }
  for (let table of next.tables) {
    let old = active.tables.find(
      (candidate) =>
        candidate.name === table.name || table.renameFrom === candidate.name,
    );
    if (!old) {
      statements.push(tableSql(table));
      for (let index of table.indexes)
        statements.push(
          `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${q(index.name)} ON ${q(table.name)} (${index.columns.map(q).join(", ")})`,
        );
      revert.unshift(`DROP TABLE ${q(table.name)}`);
      continue;
    }
    let requiresRebuild =
      JSON.stringify(old.constraints) !== JSON.stringify(table.constraints) ||
      old.columns.some((column) => {
        let nextColumn = table.columns.find(
          (candidate) =>
            candidate.name === column.name ||
            candidate.renameFrom === column.name,
        );
        return (
          !nextColumn ||
          nextColumn.type !== column.type ||
          nextColumn.nullable !== column.nullable ||
          nextColumn.autoIncrement !== column.autoIncrement
        );
      }) ||
      table.columns.some(
        (column) =>
          column.autoIncrement &&
          !old.columns.some(
            (previous) =>
              previous.name === column.name ||
              column.renameFrom === previous.name,
          ),
      );
    if (requiresRebuild) {
      let temporary = `__gadgets_rebuild_${table.name}_${version}`;
      let source = old.name,
        projections = table.columns.flatMap((column) => {
          let prior = old.columns.find(
            (candidate) =>
              candidate.name === column.name ||
              column.renameFrom === candidate.name,
          );
          return prior
            ? [`${convertedColumn(column, prior)} AS ${q(column.name)}`]
            : [];
        });
      statements.push(tableSql({ ...table, name: temporary }));
      if (projections.length)
        statements.push(
          `INSERT INTO ${q(temporary)} (${table.columns
            .filter((column) =>
              old.columns.some(
                (prior) =>
                  prior.name === column.name ||
                  column.renameFrom === prior.name,
              ),
            )
            .map((column) => q(column.name))
            .join(", ")}) SELECT ${projections.join(", ")} FROM ${q(source)}`,
        );
      statements.push(
        `DROP TABLE ${q(source)}`,
        `ALTER TABLE ${q(temporary)} RENAME TO ${q(table.name)}`,
      );
      for (let index of table.indexes)
        statements.push(
          `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${q(index.name)} ON ${q(table.name)} (${index.columns.map(q).join(", ")})`,
        );
      revert.unshift(tableSql(old));
      breaking = true;
      continue;
    }
    if (old.name !== table.name) {
      statements.push(`ALTER TABLE ${q(old.name)} RENAME TO ${q(table.name)}`);
      revert.unshift(`ALTER TABLE ${q(table.name)} RENAME TO ${q(old.name)}`);
      breaking = true;
    }
    for (let column of table.columns) {
      let prior = old.columns.find(
        (candidate) =>
          candidate.name === column.name ||
          column.renameFrom === candidate.name,
      );
      if (!prior) {
        statements.push(
          `ALTER TABLE ${q(table.name)} ADD COLUMN ${columnSql(column)}`,
        );
        revert.unshift(
          `ALTER TABLE ${q(table.name)} DROP COLUMN ${q(column.name)}`,
        );
      } else if (prior.name !== column.name) {
        statements.push(
          `ALTER TABLE ${q(table.name)} RENAME COLUMN ${q(prior.name)} TO ${q(column.name)}`,
        );
        revert.unshift(
          `ALTER TABLE ${q(table.name)} RENAME COLUMN ${q(column.name)} TO ${q(prior.name)}`,
        );
        breaking = true;
      } else if (
        prior.type !== column.type ||
        prior.nullable !== column.nullable
      ) {
        throw new Error(
          "Changing an existing column type or nullability requires rename-from plus a new column.",
        );
      }
    }
    for (let column of old.columns)
      if (
        !table.columns.some(
          (candidate) =>
            candidate.name === column.name ||
            candidate.renameFrom === column.name,
        )
      ) {
        statements.push(
          `ALTER TABLE ${q(table.name)} DROP COLUMN ${q(column.name)}`,
        );
        revert.unshift(
          `ALTER TABLE ${q(table.name)} ADD COLUMN ${columnSql(column)}`,
        );
        breaking = true;
      }
    for (let index of old.indexes)
      if (!table.indexes.some((candidate) => candidate.name === index.name)) {
        statements.push(`DROP INDEX ${q(index.name)}`);
        revert.unshift(
          `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${q(index.name)} ON ${q(table.name)} (${index.columns.map(q).join(", ")})`,
        );
      }
    for (let index of table.indexes)
      if (!old.indexes.some((candidate) => candidate.name === index.name)) {
        statements.push(
          `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${q(index.name)} ON ${q(table.name)} (${index.columns.map(q).join(", ")})`,
        );
        revert.unshift(`DROP INDEX ${q(index.name)}`);
      }
  }
  let normalizedChanges = 0;
  for (let table of active.tables)
    if (
      !next.tables.some(
        (candidate) =>
          candidate.name === table.name || candidate.renameFrom === table.name,
      )
    )
      normalizedChanges +=
        1 +
        table.columns.length +
        table.indexes.length +
        table.constraints.length;
  for (let table of next.tables) {
    let previous = active.tables.find(
      (candidate) =>
        candidate.name === table.name || table.renameFrom === candidate.name,
    );
    if (!previous) {
      normalizedChanges +=
        1 +
        table.columns.length +
        table.indexes.length +
        table.constraints.length;
      continue;
    }
    if (previous.name !== table.name) ++normalizedChanges;
    for (let column of table.columns) {
      let prior = previous.columns.find(
        (candidate) =>
          candidate.name === column.name ||
          column.renameFrom === candidate.name,
      );
      if (!prior || JSON.stringify(prior) !== JSON.stringify(column))
        ++normalizedChanges;
    }
    normalizedChanges += previous.columns.filter(
      (column) =>
        !table.columns.some(
          (candidate) =>
            candidate.name === column.name ||
            candidate.renameFrom === column.name,
        ),
    ).length;
    for (let index of table.indexes) {
      let prior = previous.indexes.find(
        (candidate) => candidate.name === index.name,
      );
      if (!prior || JSON.stringify(prior) !== JSON.stringify(index))
        ++normalizedChanges;
    }
    normalizedChanges += previous.indexes.filter(
      (index) =>
        !table.indexes.some((candidate) => candidate.name === index.name),
    ).length;
    for (let constraint of table.constraints) {
      let prior = previous.constraints.find(
        (candidate) => candidate.name === constraint.name,
      );
      if (!prior || JSON.stringify(prior) !== JSON.stringify(constraint))
        ++normalizedChanges;
    }
    normalizedChanges += previous.constraints.filter(
      (constraint) =>
        !table.constraints.some(
          (candidate) => candidate.name === constraint.name,
        ),
    ).length;
  }
  if (normalizedChanges > 300)
    throw new Error(
      "A schema proposal may contain at most 300 normalized changes.",
    );
  let xml = canonicalXml(next);
  return {
    schema: { version, xml, format: DATABASE_SCHEMA_FORMAT },
    statements,
    revert,
    breaking,
    normalizedChanges,
  };
}

/** Serializes a model deterministically for storage and agent inspection. */
export function canonicalXml(model: XmlModel): string {
  let esc = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
  let attr = (values: Record<string, string | boolean | undefined>) =>
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== false)
      .map(([key, value]) => ` ${key}="${esc(String(value))}"`)
      .join("");
  return `<schema summary="${esc(model.summary)}">\n${model.tables
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map(
      (table) =>
        `  <table${attr({ name: table.name })}>\n${table.columns
          .toSorted((a, b) => a.name.localeCompare(b.name))
          .map(
            (column) =>
              `    <column${attr({ name: column.name, type: column.type, nullable: column.nullable ? undefined : "false", default: column.defaultValue, autoincrement: column.autoIncrement ? "true" : undefined })}/>\n`,
          )
          .join("")}${table.indexes
          .toSorted((a, b) => a.name.localeCompare(b.name))
          .map(
            (index) =>
              `    <index${attr({ name: index.name, columns: index.columns.join(","), unique: index.unique ? "true" : undefined })}/>\n`,
          )
          .join("")}${table.constraints
          .toSorted((a, b) => a.name.localeCompare(b.name))
          .map(
            (constraint) =>
              `    <constraint${attr({ name: constraint.name, type: constraint.type, columns: constraint.columns.join(","), "ref-table": constraint.refTable, "ref-columns": constraint.refColumns?.join(","), "on-delete": constraint.onDelete, operator: constraint.operator, value: constraint.value, values: constraint.values?.join(",") })}/>\n`,
          )
          .join("")}  </table>`,
    )
    .join("\n")}\n</schema>`;
}
