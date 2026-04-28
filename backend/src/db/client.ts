import Database from "better-sqlite3";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = resolve(__dirname, "../../..", "data", "app.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(resolve(DB_PATH, ".."), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Track applied migrations so each file runs exactly once
  _db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (_db.prepare("SELECT filename FROM _migrations").all() as { filename: string }[])
      .map((r) => r.filename)
  );

  const migrationsDir = resolve(__dirname, "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    // Execute each statement separately so ALTER TABLE ADD COLUMN is idempotent
    // (SQLite has no "ADD COLUMN IF NOT EXISTS")
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        _db.exec(stmt + ";");
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("duplicate column name")) continue;
        throw err;
      }
    }

    _db.prepare("INSERT OR IGNORE INTO _migrations (filename) VALUES (?)").run(file);
  }

  return _db;
}
