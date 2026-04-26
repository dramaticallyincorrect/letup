import { spawn } from "node:child_process";
import { getDb } from "../db/client.js";
import { emitLog, emitDone } from "./emitter.js";
import type { ShellPipeline } from "../pipelines/schema.js";

export async function runShellPipeline(
  executionId: string,
  pipeline: ShellPipeline,
  cwd: string,
  env: Record<string, string>
) {
  const db = getDb();

  const insertLog = db.prepare(
    "INSERT INTO execution_logs (execution_id, ts, stream, text) VALUES (?, datetime('now'), ?, ?)"
  );

  function writeLog(stream: "stdout" | "stderr" | "agent", text: string) {
    const result = insertLog.run(executionId, stream, text);
    emitLog(executionId, {
      id: result.lastInsertRowid as number,
      execution_id: executionId,
      ts: new Date().toISOString(),
      stream,
      text,
    });
  }

  db.prepare("UPDATE executions SET status = 'running' WHERE id = ?").run(executionId);

  for (const step of pipeline.steps) {
    writeLog("agent", `▶ ${step.label}`);

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("sh", ["-c", step.command], {
        cwd,
        env: { ...process.env, ...env },
      });

      proc.stdout.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) writeLog("stdout", line);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) writeLog("stderr", line);
        }
      });

      proc.on("close", (code) => resolve(code ?? 0));
    });

    if (exitCode !== 0) {
      writeLog("agent", `✗ "${step.label}" exited with code ${exitCode}`);
      db.prepare(
        "UPDATE executions SET status = 'failed', finished_at = datetime('now'), exit_code = ? WHERE id = ?"
      ).run(exitCode, executionId);
      emitDone(executionId);
      return;
    }

    writeLog("agent", `✓ ${step.label}`);
  }

  db.prepare(
    "UPDATE executions SET status = 'success', finished_at = datetime('now'), exit_code = 0 WHERE id = ?"
  ).run(executionId);
  emitDone(executionId);
}
