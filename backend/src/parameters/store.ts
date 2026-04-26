import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { encrypt, decrypt } from "./crypto.js";
import type { PipelineDefinition } from "../pipelines/schema.js";

export interface MissingParam {
  key: string;
  label: string;
  description: string;
  type: "string" | "secret";
}

interface ParamRow {
  key: string;
  value_encrypted: string;
  is_secret: number;
}

export function saveValues(
  scope: "pipeline" | "board",
  scopeId: string,
  values: Record<string, string>,
  paramDefs: { key: string; type: "string" | "secret" }[]
) {
  const db = getDb();
  const typeMap = new Map(paramDefs.map((p) => [p.key, p.type]));

  const upsert = db.prepare(`
    INSERT INTO parameter_values (id, scope, scope_id, key, value_encrypted, is_secret, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(scope, scope_id, key) DO UPDATE SET
      value_encrypted = excluded.value_encrypted,
      is_secret = excluded.is_secret,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      const isSecret = typeMap.get(key) === "secret" ? 1 : 0;
      upsert.run(nanoid(), scope, scopeId, key, encrypt(value), isSecret);
    }
  });
  tx();
}

export function resolveEnv(
  pipeline: PipelineDefinition,
  columnId: string,
  boardId: string
): { env: Record<string, string>; missing: MissingParam[] } {
  const db = getDb();

  const pipelineRows = db
    .prepare("SELECT key, value_encrypted, is_secret FROM parameter_values WHERE scope = 'pipeline' AND scope_id = ?")
    .all(columnId) as ParamRow[];

  const boardRows = db
    .prepare("SELECT key, value_encrypted, is_secret FROM parameter_values WHERE scope = 'board' AND scope_id = ?")
    .all(boardId) as ParamRow[];

  const pipelineMap = new Map(pipelineRows.map((r) => [r.key, r]));
  const boardMap = new Map(boardRows.map((r) => [r.key, r]));

  const env: Record<string, string> = {};
  const missing: MissingParam[] = [];

  for (const param of pipeline.parameters) {
    const row = pipelineMap.get(param.key) ?? boardMap.get(param.key);
    if (row) {
      env[param.key] = decrypt(row.value_encrypted);
    } else if (param.required) {
      missing.push({
        key: param.key,
        label: param.label,
        description: param.description,
        type: param.type,
      });
    }
  }

  return { env, missing };
}
