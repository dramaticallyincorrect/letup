import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

const CreateColumn = z.object({ name: z.string().min(1) });
const ReorderColumns = z.object({
  columns: z.array(z.object({ id: z.string(), position: z.number().int() })),
});

export async function columnRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/columns",
    async (req, reply) => {
      const board = db.prepare("SELECT id FROM boards WHERE id = ?").get(req.params.boardId);
      if (!board) return reply.status(404).send({ error: "Board not found" });
      return db
        .prepare("SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC")
        .all(req.params.boardId);
    }
  );

  app.post<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/columns",
    async (req, reply) => {
      const board = db.prepare("SELECT id FROM boards WHERE id = ?").get(req.params.boardId);
      if (!board) return reply.status(404).send({ error: "Board not found" });

      const body = CreateColumn.parse(req.body);
      const id = nanoid();
      const maxPos = (
        db
          .prepare("SELECT MAX(position) as m FROM columns WHERE board_id = ?")
          .get(req.params.boardId) as { m: number | null }
      ).m ?? -1;

      db.prepare(
        "INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)"
      ).run(id, req.params.boardId, body.name, maxPos + 1);

      return reply
        .status(201)
        .send(db.prepare("SELECT * FROM columns WHERE id = ?").get(id));
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/api/columns/:id",
    async (req, reply) => {
      const body = CreateColumn.parse(req.body);
      const result = db
        .prepare("UPDATE columns SET name = ? WHERE id = ?")
        .run(body.name, req.params.id);
      if (result.changes === 0)
        return reply.status(404).send({ error: "Column not found" });
      return db.prepare("SELECT * FROM columns WHERE id = ?").get(req.params.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/columns/:id",
    async (req, reply) => {
      db.prepare("DELETE FROM columns WHERE id = ?").run(req.params.id);
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/columns/reorder",
    async (req, reply) => {
      const { columns } = ReorderColumns.parse(req.body);
      const update = db.prepare(
        "UPDATE columns SET position = ? WHERE id = ? AND board_id = ?"
      );
      const tx = db.transaction(() => {
        for (const col of columns) {
          update.run(col.position, col.id, req.params.boardId);
        }
      });
      tx();
      return reply.status(204).send();
    }
  );
}
