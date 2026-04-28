import { getDb } from "../db/client.js";
import { getAgentRunner } from "../agents/claude.js";
import { emitLog, emitDone } from "./emitter.js";
import { createCardTools } from "./tools.js";
import type { AgentPipeline } from "../pipelines/schema.js";

function buildSystemPrompt(workspacePath: string, card: { title: string; description: string; metadata_json: string }): string {
  const meta = (() => {
    try { return JSON.stringify(JSON.parse(card.metadata_json), null, 2); } catch { return "{}"; }
  })();
  return [
    `You are an executor agent running inside an AI Kanban board.`,
    `A card has been moved into a column and you must complete the task described below.`,
    ``,
    `Working directory: ${workspacePath}`,
    `Card title: ${card.title}`,
    `Card description: ${card.description || "(none)"}`,
    `Card metadata: ${meta}`,
    ``,
    `## Tools available`,
    ``,
    `**bash** — Run shell commands in the board workspace.`,
    ``,
    `**set_card_metadata(metadata)** — Shallow-merge structured results onto this card.`,
    `Use this to save any data your run produces: quiz questions, analysis results, scores, summaries, URLs, etc.`,
    ``,
    `Complete the task and save any structured results with set_card_metadata.`,
  ].join("\n");
}

export async function runAgentPipeline(
  executionId: string,
  pipeline: AgentPipeline,
  workspacePath: string,
  env: Record<string, string>,
  cardId: string
): Promise<void> {
  const db = getDb();

  db.prepare("UPDATE executions SET status = 'running', started_at = datetime('now') WHERE id = ?").run(executionId);

  const card = db
    .prepare("SELECT title, description, metadata_json FROM cards WHERE id = ?")
    .get(cardId) as { title: string; description: string; metadata_json: string };

  const insertLog = db.prepare(
    "INSERT INTO execution_logs (execution_id, ts, stream, text) VALUES (?, datetime('now'), ?, ?)"
  );

  function writeLog(text: string) {
    const res = insertLog.run(executionId, "agent", text);
    emitLog(executionId, {
      id: res.lastInsertRowid as number,
      execution_id: executionId,
      ts: new Date().toISOString(),
      stream: "agent",
      text,
    });
  }

  let lineBuf = "";
  function onChunk(text: string) {
    lineBuf += text;
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      writeLog(line);
    }
  }
  function flushBuf() {
    if (lineBuf.trim()) writeLog(lineBuf);
    lineBuf = "";
  }

  const resolvedPrompt = pipeline.prompt
    .replace(/\{\{card\.title\}\}/g, card.title)
    .replace(/\{\{card\.description\}\}/g, card.description || "");

  try {
    const runner = getAgentRunner();
    const result = await runner.run({
      prompt: resolvedPrompt,
      systemPrompt: buildSystemPrompt(workspacePath, card),
      tools: ["bash"],
      customTools: createCardTools(cardId),
      cwd: workspacePath,
      env,
      maxTurns: pipeline.maxTurns,
      onLogLine: onChunk,
    });

    flushBuf();

    const status = result.status === "success" ? "success" : "failed";
    db.prepare(
      "UPDATE executions SET status = ?, finished_at = datetime('now') WHERE id = ?"
    ).run(status, executionId);
  } catch (err) {
    flushBuf();
    writeLog(`Error: ${String(err)}`);
    db.prepare(
      "UPDATE executions SET status = 'failed', finished_at = datetime('now') WHERE id = ?"
    ).run(executionId);
  }

  emitDone(executionId);
}
