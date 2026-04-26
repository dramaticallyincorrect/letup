import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
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

  const migration = readFileSync(
    resolve(__dirname, "migrations", "001_init.sql"),
    "utf8"
  );
  _db.exec(migration);

  return _db;
}
