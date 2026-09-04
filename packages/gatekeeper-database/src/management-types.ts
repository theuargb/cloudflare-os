import type { RpcTarget } from "capnweb";
import type {
  DatabaseSchema,
  DatabaseSchemaProposal,
} from "@gadgets/workshop-shared/database";

/** One connection access profile. */
export type DatabaseAccessProfile = {
  id: string;
  configured: boolean;
  grants: Array<{
    table: string;
    column?: string;
    permission: "read" | "write" | "table-write";
  }>;
};
/** Value-free audit record. */
export type DatabaseAuditEntry = {
  id: number;
  profileId?: string;
  operation: string;
  tables: string[];
  schemaVersion: number;
  createdAt: string;
};
/** Snapshot used by the Database management app. */
export type DatabaseManagementSnapshot = {
  schema: DatabaseSchema;
  proposals: DatabaseSchemaProposal[];
  profiles: DatabaseAccessProfile[];
  audit: DatabaseAuditEntry[];
};
/** Current app viewer. */
export type DatabaseViewer = {
  actorId: string;
  actor: { displayName: string; avatar?: { url: string } };
  isAdmin: boolean;
};
/** One editor diagnostic. Positions are one-based when available. */
export type DatabaseSchemaDiagnostic = {
  message: string;
  line?: number;
  column?: number;
};
/** Non-persisting validation result for an edited proposal. */
export type DatabaseProposalValidation = {
  valid: boolean;
  diagnostics: DatabaseSchemaDiagnostic[];
  normalizedChanges?: number;
  breaking?: boolean;
};
/** Database app capability. */
export interface DatabaseManagementApi extends RpcTarget {
  getSnapshot(): Promise<DatabaseManagementSnapshot>;
  getViewer(): Promise<DatabaseViewer>;
  validateProposal(
    id: string,
    xml: string,
  ): Promise<DatabaseProposalValidation>;
  saveProposal(id: string, xml: string): Promise<DatabaseSchemaProposal>;
  markProposalReady(id: string): Promise<void>;
  configureProfile(id: string): Promise<void>;
  setProfileGrants(
    id: string,
    grants: DatabaseAccessProfile["grants"],
  ): Promise<void>;
}
