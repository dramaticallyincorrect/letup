import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";
import { saveValues } from "../parameters/store.js";
import {
  runSetupPipeline,
  resolveBoardEnv,
  setupEmitter,
  type SetupLogLine,
} from "../execution/setup.js";
import { PipelineDefinitionSchema } from "../pipelines/schema.js";

export async function setupRoutes(app: FastifyInstance) {
  const db = getDb();

  // Trigger setup run
  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/setup/run",
    async (req, reply) => {
      const board = db
        .prepare("SELECT id, parameters_json, setup_pipeline_json, setup_status FROM boards WHERE id = ?")
        .get(req.params.boardId) as {
          id: string;
          parameters_json: string;
          setup_pipeline_json: string | null;
          setup_status: string;
        } | undefined;

      if (!board) return reply.status(404).send({ error: "Board not found" });
      if (!board.setup_pipeline_json) return reply.status(422).send({ error: "No setup pipeline configured" });
      if (board.setup_status === "running") return reply.status(409).send({ error: "Setup already running" });
      if (board.setup_status === "success") return reply.status(409).send({ error: "Setup already completed" });

      // Validate pipeline JSON before triggering
      try {
        PipelineDefinitionSchema.parse(JSON.parse(board.setup_pipeline_json));
      } catch {
        return reply.status(422).send({ error: "Invalid setup pipeline definition" });
      }

      const { missing } = resolveBoardEnv(req.params.boardId, board.parameters_json);
      if (missing.length > 0) return reply.status(409).send({ missing });

      setImmediate(() => {
        runSetupPipeline(req.params.boardId).catch((err) => {
          console.error("Setup pipeline error:", err);
          db.prepare("UPDATE boards SET setup_status = 'failed' WHERE id = ?").run(req.params.boardId);
        });
      });

      return reply.status(202).send({ ok: true });
    }
  );

  // SSE: stream setup run logs
  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/setup/logs",
    async (req, reply) => {
      const board = db
        .prepare("SELECT id, setup_status FROM boards WHERE id = ?")
        .get(req.params.boardId) as { id: string; setup_status: string } | undefined;
      if (!board) return reply.status(404).send({ error: "Board not found" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, data: unknown) =>
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Replay existing logs
      const existing = db
        .prepare("SELECT * FROM setup_run_logs WHERE board_id = ? ORDER BY id ASC")
        .all(req.params.boardId);
      for (const log of existing) send("log", log);

      // If already terminal, close immediately
      const current = db
        .prepare("SELECT setup_status FROM boards WHERE id = ?")
        .get(req.params.boardId) as { setup_status: string };
      if (current.setup_status === "success" || current.setup_status === "failed") {
        send("done", { status: current.setup_status });
        reply.raw.end();
        return reply;
      }

      const onLog = (log: SetupLogLine) => send("log", log);
      const onDone = () => {
        const final = db
          .prepare("SELECT setup_status FROM boards WHERE id = ?")
          .get(req.params.boardId) as { setup_status: string };
        send("done", { status: final.setup_status });
        reply.raw.end();
      };

      setupEmitter.on(`log:${board.id}`, onLog);
      setupEmitter.once(`done:${board.id}`, onDone);

      req.raw.on("close", () => {
        setupEmitter.off(`log:${board.id}`, onLog);
        setupEmitter.off(`done:${board.id}`, onDone);
      });

      return reply;
    }
  );

  // Save board-level parameter values
  app.post<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/parameters",
    async (req, reply) => {
      const board = db
        .prepare("SELECT id, parameters_json FROM boards WHERE id = ?")
        .get(req.params.boardId) as { id: string; parameters_json: string } | undefined;
      if (!board) return reply.status(404).send({ error: "Board not found" });

      const { values } = req.body as { values: Record<string, string> };
      const paramDefs: { key: string; type: "string" | "secret" }[] = (() => {
        try { return JSON.parse(board.parameters_json || "[]"); } catch { return []; }
      })();

      saveValues("board", req.params.boardId, values, paramDefs);
      return reply.status(204).send();
    }
  );

  // Reset setup status (allows re-running)
  app.post<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/setup/reset",
    async (req, reply) => {
      const result = db
        .prepare("UPDATE boards SET setup_status = 'idle' WHERE id = ?")
        .run(req.params.boardId);
      if (result.changes === 0) return reply.status(404).send({ error: "Board not found" });
      db.prepare("DELETE FROM setup_run_logs WHERE board_id = ?").run(req.params.boardId);
      return reply.status(204).send();
    }
  );
}
