PRAGMA foreign_keys = ON;

CREATE TABLE installation_database (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  active_schema_version INTEGER NOT NULL,
  active_schema_xml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE database_schemas (
  version INTEGER PRIMARY KEY,
  schema_xml TEXT NOT NULL,
  activated_at TEXT NOT NULL
);

CREATE TABLE database_schema_proposals (
  proposal_id TEXT PRIMARY KEY,
  base_version INTEGER NOT NULL,
  target_version INTEGER NOT NULL,
  xml TEXT NOT NULL,
  compiled_json TEXT NOT NULL,
  breaking INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'active', 'rejected', 'stale')),
  review_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT
);

CREATE TABLE database_access_profiles (
  profile_id TEXT PRIMARY KEY,
  configured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE database_access_grants (
  profile_id TEXT NOT NULL REFERENCES database_access_profiles(profile_id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  column_name TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'table-write')),
  PRIMARY KEY (profile_id, table_name, column_name, permission)
);

CREATE TABLE database_audit_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT,
  operation TEXT NOT NULL,
  tables_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX database_audit_time ON database_audit_events(created_at DESC);
