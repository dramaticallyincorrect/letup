import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { PipelineDefinitionSchema } from "../pipelines/schema.js";

export async function pipelineRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/pipeline",
    async (req, reply) => {
      const row = db
        .prepare("SELECT * FROM pipelines WHERE column_id = ?")
        .get(req.params.columnId);
      if (!row) return reply.status(404).send({ error: "No pipeline" });
      return row;
    }
  );

  app.put<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/pipeline",
    async (req, reply) => {
      const col = db
        .prepare("SELECT id FROM columns WHERE id = ?")
        .get(req.params.columnId);
      if (!col) return reply.status(404).send({ error: "Column not found" });

      const definition = PipelineDefinitionSchema.parse(req.body);

      const existing = db
        .prepare("SELECT id FROM pipelines WHERE column_id = ?")
        .get(req.params.columnId);

      if (existing) {
        db.prepare("UPDATE pipelines SET definition_json = ? WHERE column_id = ?").run(
          JSON.stringify(definition),
          req.params.columnId
        );
      } else {
        db.prepare(
          "INSERT INTO pipelines (id, column_id, definition_json) VALUES (?, ?, ?)"
        ).run(nanoid(), req.params.columnId, JSON.stringify(definition));
      }

      return db
        .prepare("SELECT * FROM pipelines WHERE column_id = ?")
        .get(req.params.columnId);
    }
  );

  app.delete<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/pipeline",
    async (req, reply) => {
      db.prepare("DELETE FROM pipelines WHERE column_id = ?").run(req.params.columnId);
      return reply.status(204).send();
    }
  );

  // Return all pipelines for a board (columnId → pipeline)
  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/pipelines",
    async (req) => {
      const rows = db
        .prepare(
          `SELECT pipelines.* FROM pipelines
           JOIN columns ON pipelines.column_id = columns.id
           WHERE columns.board_id = ?`
        )
        .all(req.params.boardId) as { column_id: string; definition_json: string; id: string; created_at: string }[];
      return Object.fromEntries(rows.map((r) => [r.column_id, r]));
    }
  );
}
