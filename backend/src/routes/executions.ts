import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { triggerExecution } from "../execution/runner.js";
import { executionEmitter } from "../execution/emitter.js";
import type { LogLine } from "../execution/emitter.js";

const TriggerBody = z.object({
  cardId: z.string(),
  columnId: z.string(),
});

export async function executionRoutes(app: FastifyInstance) {
  const db = getDb();

  app.post("/api/executions", async (req, reply) => {
    const { cardId, columnId } = TriggerBody.parse(req.body);

    const pipeline = db
      .prepare("SELECT id FROM pipelines WHERE column_id = ?")
      .get(columnId);
    if (!pipeline)
      return reply.status(422).send({ error: "Column has no pipeline" });

    const result = await triggerExecution(cardId, columnId);

    if ("conflict" in result)
      return reply.status(409).send({ error: "Execution already in progress for this card" });

    if ("missing" in result)
      return reply.status(409).send({ missing: result.missing });

    return reply.status(201).send({ executionId: result.executionId });
  });

  app.get<{ Params: { id: string } }>(
    "/api/executions/:id",
    async (req, reply) => {
      const exec = db
        .prepare("SELECT * FROM executions WHERE id = ?")
        .get(req.params.id);
      if (!exec) return reply.status(404).send({ error: "Execution not found" });
      return exec;
    }
  );

  // SSE: streams log lines as they arrive, then sends event:done when execution finishes
  app.get<{ Params: { id: string } }>(
    "/api/executions/:id/logs",
    async (req, reply) => {
      const exec = db
        .prepare("SELECT id, status FROM executions WHERE id = ?")
        .get(req.params.id) as { id: string; status: string } | undefined;
      if (!exec) return reply.status(404).send({ error: "Execution not found" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Replay logs already in DB
      const existing = db
        .prepare(
          "SELECT * FROM execution_logs WHERE execution_id = ? ORDER BY id ASC"
        )
        .all(req.params.id);
      for (const log of existing) {
        send("log", log);
      }

      // If already terminal, close immediately
      const current = db
        .prepare("SELECT status FROM executions WHERE id = ?")
        .get(req.params.id) as { status: string };
      if (current.status === "success" || current.status === "failed") {
        send("done", { status: current.status });
        reply.raw.end();
        return reply;
      }

      const onLog = (log: LogLine) => send("log", log);
      const onDone = () => {
        const final = db
          .prepare("SELECT status FROM executions WHERE id = ?")
          .get(req.params.id) as { status: string };
        send("done", { status: final.status });
        reply.raw.end();
      };

      executionEmitter.on(`log:${exec.id}`, onLog);
      executionEmitter.once(`done:${exec.id}`, onDone);

      req.raw.on("close", () => {
        executionEmitter.off(`log:${exec.id}`, onLog);
        executionEmitter.off(`done:${exec.id}`, onDone);
      });

      return reply;
    }
  );

  // Latest execution for a card
  app.get<{ Params: { cardId: string } }>(
    "/api/cards/:cardId/executions/latest",
    async (req, reply) => {
      const exec = db
        .prepare(
          "SELECT * FROM executions WHERE card_id = ? ORDER BY started_at DESC LIMIT 1"
        )
        .get(req.params.cardId);
      if (!exec) return reply.status(404).send({ error: "No executions" });
      return exec;
    }
  );
}
