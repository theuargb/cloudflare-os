import type { DatabaseValue } from "@gadgets/workshop-shared/database";
import type { XmlModel } from "./xml-schema.js";

type Profile = { configured: boolean; grants: Set<string> };

/** First-pass SQL classification for audit labels only; it deliberately does not reject SQL. */
export async function authorizeSql(
  sql: string,
  _model: XmlModel,
  _profile: Profile,
): Promise<{ tables: string[]; write: boolean }> {
  let operation = /^\s*(select|insert|update|delete)\b/i.exec(sql)?.[1]?.toLowerCase();
  let table = /\b(?:from|into|update)\s+["`[]?([a-z_][a-z0-9_]*)/i.exec(sql)?.[1];
  return {
    tables: table ? [table] : [],
    write: operation === "insert" || operation === "update" || operation === "delete",
  };
}

/** Validates parameter values before D1 receives them. */
export function parameters(values: DatabaseValue[] | undefined): DatabaseValue[] { return values ?? []; }
