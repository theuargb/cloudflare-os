import { describe, expect, it } from "vitest";
import {
  DatabaseDataGatekeeper,
  DatabaseSchemaGatekeeper,
} from "../src/database-gatekeeper";

describe("Database binding documentation", () => {
  it("includes a canonical wrapper and copyable data examples", async () => {
    let types =
      await DatabaseDataGatekeeper.prototype.getTypeScriptTypes.call(undefined);

    expect(types).toContain("export default async function(self, env, ctx)");
    expect(types).toContain("env.DATABASE_DATA.getSchema()");
    expect(types).toContain("env.DATABASE_DATA.run(");
    expect(types).toContain("env.DATABASE_DATA.batch(");
  });

  it("includes a canonical wrapper and a copyable schema proposal", async () => {
    let types =
      await DatabaseSchemaGatekeeper.prototype.getTypeScriptTypes.call(
        undefined,
      );

    expect(types).toContain("export default async function(self, env, ctx)");
    expect(types).toContain("env.DATABASE_SCHEMA.getSchema()");
    expect(types).toContain("env.DATABASE_SCHEMA.proposeSchema(");
  });
});
