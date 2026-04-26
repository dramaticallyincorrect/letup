CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL UNIQUE REFERENCES columns(id) ON DELETE CASCADE,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id),
  pipeline_snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  exit_code INTEGER
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  stream TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipelines_column_id ON pipelines(column_id);
CREATE INDEX IF NOT EXISTS idx_executions_card_id ON executions(card_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs(execution_id);
