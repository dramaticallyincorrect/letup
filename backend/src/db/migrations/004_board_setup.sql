ALTER TABLE boards ADD COLUMN parameters_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE boards ADD COLUMN setup_pipeline_json TEXT;
ALTER TABLE boards ADD COLUMN setup_status TEXT NOT NULL DEFAULT 'idle';

CREATE TABLE IF NOT EXISTS setup_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  stream TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_setup_run_logs_board_id ON setup_run_logs(board_id);
