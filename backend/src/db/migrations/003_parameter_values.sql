CREATE TABLE IF NOT EXISTS parameter_values (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('pipeline', 'board')),
  scope_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope, scope_id, key)
);

CREATE INDEX IF NOT EXISTS idx_param_values_scope ON parameter_values(scope, scope_id);
