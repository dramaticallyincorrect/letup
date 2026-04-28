import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { getDb } from "../db/client.js";
import { decrypt } from "../parameters/crypto.js";
import { getAgentRunner } from "../agents/claude.js";
import { PipelineDefinitionSchema } from "../pipelines/schema.js";

export interface SetupLogLine {
  id: number;
  board_id: string;
  ts: string;
  stream: string;
  text: string;
}

export interface MissingBoardParam {
  key: string;
  label: string;
  description: string;
  type: "string" | "secret";
}

export const setupEmitter = new EventEmitter();
setupEmitter.setMaxListeners(50);

export function emitSetupLog(boardId: string, log: SetupLogLine) {
  setupEmitter.emit(`log:${boardId}`, log);
}

export function emitSetupDone(boardId: string) {
  setupEmitter.emit(`done:${boardId}`);
}

interface ParamDef {
  key: string;
  label: string;
  description: string;
  type: "string" | "secret";
  required: boolean;
}

interface ParamRow {
  key: string;
  value_encrypted: string;
}

export function resolveBoardEnv(
  boardId: string,
  parametersJson: string
): { env: Record<string, string>; missing: MissingBoardParam[] } {
  const db = getDb();
  const defs: ParamDef[] = (() => {
    try { return JSON.parse(parametersJson || "[]"); } catch { return []; }
  })();

  const rows = db
    .prepare("SELECT key, value_encrypted FROM parameter_values WHERE scope = 'board' AND scope_id = ?")
    .all(boardId) as ParamRow[];

  const stored = new Map(rows.map((r) => [r.key, r.value_encrypted]));
  const env: Record<string, string> = {};
  const missing: MissingBoardParam[] = [];

  for (const def of defs) {
    const enc = stored.get(def.key);
    if (enc) {
      env[def.key] = decrypt(enc);
    } else if (def.required) {
      missing.push({ key: def.key, label: def.label, description: def.description, type: def.type });
    }
  }

  return { env, missing };
}

export async function runSetupPipeline(boardId: string): Promise<void> {
  const db = getDb();

  const board = db.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as {
    id: string;
    name: string;
    workspace_path: string;
    parameters_json: string;
    setup_pipeline_json: string;
  } | undefined;
  if (!board || !board.setup_pipeline_json) throw new Error("No setup pipeline");

  const pipeline = PipelineDefinitionSchema.parse(JSON.parse(board.setup_pipeline_json));
  const { env } = resolveBoardEnv(boardId, board.parameters_json);

  db.prepare("UPDATE boards SET setup_status = 'running' WHERE id = ?").run(boardId);

  const insertLog = db.prepare(
    "INSERT INTO setup_run_logs (board_id, ts, stream, text) VALUES (?, datetime('now'), ?, ?)"
  );

  function writeLog(stream: "stdout" | "stderr" | "agent", text: string) {
    const res = insertLog.run(boardId, stream, text);
    emitSetupLog(boardId, {
      id: res.lastInsertRowid as number,
      board_id: boardId,
      ts: new Date().toISOString(),
      stream,
      text,
    });
  }

  try {
    if (pipeline.type === "shell") {
      for (const step of pipeline.steps) {
        writeLog("agent", `▶ ${step.label}`);

        const exitCode = await new Promise<number>((resolve) => {
          const proc = spawn("sh", ["-c", step.command], {
            cwd: board.workspace_path,
            env: { ...process.env, ...env },
          });
          proc.stdout.on("data", (d: Buffer) => {
            for (const line of d.toString().split("\n")) {
              if (line.trim()) writeLog("stdout", line);
            }
          });
          proc.stderr.on("data", (d: Buffer) => {
            for (const line of d.toString().split("\n")) {
              if (line.trim()) writeLog("stderr", line);
            }
          });
          proc.on("close", (code) => resolve(code ?? 0));
        });

        if (exitCode !== 0) {
          writeLog("agent", `✗ "${step.label}" exited with code ${exitCode}`);
          db.prepare("UPDATE boards SET setup_status = 'failed' WHERE id = ?").run(boardId);
          emitSetupDone(boardId);
          return;
        }

        writeLog("agent", `✓ ${step.label}`);
      }
    } else if (pipeline.type === "agent") {
      let lineBuf = "";
      const flush = () => {
        if (lineBuf.trim()) writeLog("agent", lineBuf);
        lineBuf = "";
      };

      const runner = getAgentRunner();
      const result = await runner.run({
        prompt: pipeline.prompt,
        systemPrompt: `You are a setup agent initializing the workspace for an AI Kanban board.\nWorking directory: ${board.workspace_path}\nComplete the setup task, then summarize what you did.`,
        tools: ["bash"],
        cwd: board.workspace_path,
        env,
        maxTurns: pipeline.maxTurns,
        onLogLine: (text) => {
          lineBuf += text;
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop() ?? "";
          for (const line of lines) writeLog("agent", line);
        },
      });
      flush();

      if (result.status === "failed") {
        db.prepare("UPDATE boards SET setup_status = 'failed' WHERE id = ?").run(boardId);
        emitSetupDone(boardId);
        return;
      }
    }

    db.prepare("UPDATE boards SET setup_status = 'success' WHERE id = ?").run(boardId);
  } catch (err) {
    writeLog("stderr", `Error: ${String(err)}`);
    db.prepare("UPDATE boards SET setup_status = 'failed' WHERE id = ?").run(boardId);
  }

  emitSetupDone(boardId);
}
