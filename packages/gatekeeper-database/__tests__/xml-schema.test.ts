import {describe, expect, it} from "vitest";
import {compileSchema, mergeSchema, parseSchemaXml} from "../src/xml-schema.js";
import {DATABASE_SCHEMA_FORMAT} from "../src/schema-format.js";

const empty = parseSchemaXml('<schema summary="empty"></schema>');

describe("database XML schema", () => {
  it("merges compatible repeated table fragments", () => {
    let model = mergeSchema(empty, parseSchemaXml('<schema summary="customers"><table name="customers"><column name="id" type="integer" nullable="false"/></table><table name="customers"><column name="email" type="text"/></table></schema>'));
    expect(model.tables[0]?.columns.map(column => column.name)).toEqual(["id", "email"]);
  });

  it("rejects unsafe XML constructs and conflicting duplicate columns", () => {
    expect(() => parseSchemaXml('<!DOCTYPE schema><schema summary="bad"></schema>')).toThrow();
    expect(() => mergeSchema(empty, parseSchemaXml('<schema summary="bad"><table name="items"><column name="id" type="integer"/><column name="id" type="text"/></table></schema>'))).toThrow();
  });

  it("quotes string defaults and compiles declared conversions", () => {
    let first = mergeSchema(empty, parseSchemaXml('<schema summary="first"><table name="items"><column name="id" type="integer"/><column name="label" type="text" default="x\' ); DROP TABLE items; --"/></table></schema>'));
    let initial = compileSchema(empty, first, 1);
    expect(initial.statements.join(" ")).toContain("DEFAULT 'x'' ); DROP TABLE items; --'");
    let second = mergeSchema(first, parseSchemaXml('<schema summary="convert"><table name="items"><column name="id" type="text" conversion="integer_to_text"/></table></schema>'));
    expect(compileSchema(first, second, 2).statements.join(" ")).toContain("CAST(\"id\" AS TEXT)");
  });

  it("accepts 300 normalized changes and rejects 301", () => {
    let schema = (count: number) => `<schema summary="many"><table name="items">${Array.from({length: count}, (_, index) => `<column name="c${index}" type="text"/>`).join("")}</table></schema>`;
    expect(() => compileSchema(empty, mergeSchema(empty, parseSchemaXml(schema(299))), 1)).not.toThrow();
    expect(() => compileSchema(empty, mergeSchema(empty, parseSchemaXml(schema(300))), 1)).toThrow("300 normalized changes");
  });

  it("publishes parseable examples with every compiled schema", () => {
    for (let example of Object.values(DATABASE_SCHEMA_FORMAT.examples)) {
      expect(() => parseSchemaXml(example)).not.toThrow();
    }
    let next = mergeSchema(empty, parseSchemaXml(DATABASE_SCHEMA_FORMAT.examples.create));
    expect(compileSchema(empty, next, 1).schema.format).toBe(DATABASE_SCHEMA_FORMAT);
  });

  it("compiles explicit autoincrement keys and enum constraints", () => {
    let next = mergeSchema(empty, parseSchemaXml('<schema summary="items"><table name="items"><column name="id" type="integer" nullable="false" autoincrement="true"/><column name="status" type="text"/><constraint name="items_pk" type="primary" columns="id"/><constraint name="items_status_enum" type="enum" columns="status" values="draft,published"/></table></schema>'));
    let ddl = compileSchema(empty, next, 1).statements.join(" ");
    expect(ddl).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(ddl).toContain('CHECK ("status" IN (\'draft\', \'published\'))');
  });

  it("rejects invalid autoincrement and enum declarations", () => {
    expect(() => parseSchemaXml('<schema summary="bad"><table name="items"><column name="id" type="text" autoincrement="true"/></table></schema>')).toThrow("autoincrement requires an integer");
    expect(() => parseSchemaXml('<schema summary="bad"><table name="items"><column name="status" type="text"/><constraint name="items_status_enum" type="enum" columns="status,id" values="draft,published"/></table></schema>')).toThrow("enum constraints require one column");
    let invalid = mergeSchema(empty, parseSchemaXml('<schema summary="bad"><table name="items"><column name="id" type="integer" autoincrement="true"/></table></schema>'));
    expect(() => compileSchema(empty, invalid, 1)).toThrow("autoincrement column must be");
  });
});
