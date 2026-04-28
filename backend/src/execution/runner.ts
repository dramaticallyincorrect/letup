import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { runShellPipeline } from "./shell.js";
import { runAgentPipeline } from "./agent.js";
import { PipelineDefinitionSchema } from "../pipelines/schema.js";
import { resolveEnv } from "../parameters/store.js";
import type { MissingParam } from "../parameters/store.js";
import { emitDone } from "./emitter.js";

interface TriggerResult {
  executionId: string;
}

interface ConflictResult {
  conflict: true;
}

interface MissingParamsResult {
  missing: MissingParam[];
}

export async function triggerExecution(
  cardId: string,
  columnId: string
): Promise<TriggerResult | ConflictResult | MissingParamsResult> {
  const db = getDb();

  const running = db
    .prepare(
      "SELECT id FROM executions WHERE card_id = ? AND status IN ('pending', 'running')"
    )
    .get(cardId);
  if (running) return { conflict: true };

  const column = db
    .prepare(
      `SELECT columns.id, columns.board_id, boards.workspace_path
       FROM columns JOIN boards ON columns.board_id = boards.id
       WHERE columns.id = ?`
    )
    .get(columnId) as { id: string; board_id: string; workspace_path: string } | undefined;
  if (!column) throw new Error("Column not found");

  const pipelineRow = db
    .prepare("SELECT definition_json FROM pipelines WHERE column_id = ?")
    .get(columnId) as { definition_json: string } | undefined;
  if (!pipelineRow) throw new Error("No pipeline on this column");

  const pipeline = PipelineDefinitionSchema.parse(JSON.parse(pipelineRow.definition_json));

  // Resolve parameters — gate on missing required values
  const { env, missing } = resolveEnv(pipeline, columnId, column.board_id);
  if (missing.length > 0) return { missing };

  const executionId = nanoid();
  db.prepare(
    "INSERT INTO executions (id, card_id, column_id, pipeline_snapshot_json, status) VALUES (?, ?, ?, ?, 'pending')"
  ).run(executionId, cardId, columnId, JSON.stringify(pipeline));

  setImmediate(() => {
    if (pipeline.type === "shell") {
      runShellPipeline(executionId, pipeline, column.workspace_path, env).catch((err) => {
        console.error("Shell execution error:", err);
        db.prepare(
          "UPDATE executions SET status = 'failed', finished_at = datetime('now') WHERE id = ?"
        ).run(executionId);
        emitDone(executionId);
      });
    } else if (pipeline.type === "agent") {
      runAgentPipeline(executionId, pipeline, column.workspace_path, env, cardId).catch((err) => {
        console.error("Agent execution error:", err);
        db.prepare(
          "UPDATE executions SET status = 'failed', finished_at = datetime('now') WHERE id = ?"
        ).run(executionId);
        emitDone(executionId);
      });
    }
  });

  return { executionId };
}
