import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

const CreateCard = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
});

const UpdateCard = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

const MoveCard = z.object({
  columnId: z.string(),
  position: z.number().int().min(0),
});

const PatchMetadata = z.object({
  patch: z.record(z.unknown()),
});

export async function cardRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/cards",
    async (req, reply) => {
      const col = db.prepare("SELECT id FROM columns WHERE id = ?").get(req.params.columnId);
      if (!col) return reply.status(404).send({ error: "Column not found" });
      return db
        .prepare("SELECT * FROM cards WHERE column_id = ? ORDER BY position ASC")
        .all(req.params.columnId);
    }
  );

  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/cards",
    async (req) => {
      return db
        .prepare(
          `SELECT cards.* FROM cards
           JOIN columns ON cards.column_id = columns.id
           WHERE columns.board_id = ?
           ORDER BY columns.position ASC, cards.position ASC`
        )
        .all(req.params.boardId);
    }
  );

  app.post<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/cards",
    async (req, reply) => {
      const col = db.prepare("SELECT id FROM columns WHERE id = ?").get(req.params.columnId);
      if (!col) return reply.status(404).send({ error: "Column not found" });

      const body = CreateCard.parse(req.body);
      const id = nanoid();
      const maxPos = (
        db
          .prepare("SELECT MAX(position) as m FROM cards WHERE column_id = ?")
          .get(req.params.columnId) as { m: number | null }
      ).m ?? -1;

      db.prepare(
        "INSERT INTO cards (id, column_id, title, description, position) VALUES (?, ?, ?, ?, ?)"
      ).run(id, req.params.columnId, body.title, body.description, maxPos + 1);

      return reply
        .status(201)
        .send(db.prepare("SELECT * FROM cards WHERE id = ?").get(id));
    }
  );

  app.patch<{ Params: { id: string } }>("/api/cards/:id", async (req, reply) => {
    const body = UpdateCard.parse(req.body);
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
    if (!card) return reply.status(404).send({ error: "Card not found" });

    db.prepare(
      "UPDATE cards SET title = ?, description = ? WHERE id = ?"
    ).run(
      body.title ?? card.title,
      body.description ?? card.description,
      req.params.id
    );

    return db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
  });

  app.post<{ Params: { id: string } }>(
    "/api/cards/:id/move",
    async (req, reply) => {
      const { columnId, position } = MoveCard.parse(req.body);
      const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
      if (!card) return reply.status(404).send({ error: "Card not found" });

      const col = db.prepare("SELECT id FROM columns WHERE id = ?").get(columnId);
      if (!col) return reply.status(404).send({ error: "Column not found" });

      const tx = db.transaction(() => {
        // Shift cards in target column to make space
        db.prepare(
          "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND id != ?"
        ).run(columnId, position, req.params.id);

        db.prepare(
          "UPDATE cards SET column_id = ?, position = ? WHERE id = ?"
        ).run(columnId, position, req.params.id);
      });
      tx();

      return db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/api/cards/:id/metadata",
    async (req, reply) => {
      const { patch } = PatchMetadata.parse(req.body);
      const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id) as
        | { metadata_json: string }
        | undefined;
      if (!card) return reply.status(404).send({ error: "Card not found" });

      const current = (() => {
        try {
          return JSON.parse(card.metadata_json || "{}") as Record<string, unknown>;
        } catch {
          return {};
        }
      })();

      db.prepare("UPDATE cards SET metadata_json = ? WHERE id = ?").run(
        JSON.stringify({ ...current, ...patch }),
        req.params.id
      );

      return db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/cards/:id",
    async (req, reply) => {
      db.prepare("DELETE FROM cards WHERE id = ?").run(req.params.id);
      return reply.status(204).send();
    }
  );
}
