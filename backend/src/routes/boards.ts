import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../..", "data");

const CreateBoard = z.object({ name: z.string().min(1) });

export async function boardRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get("/api/boards", async () => {
    return db.prepare("SELECT * FROM boards ORDER BY created_at DESC").all();
  });

  app.get<{ Params: { id: string } }>("/api/boards/:id", async (req, reply) => {
    const board = db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id);
    if (!board) return reply.status(404).send({ error: "Board not found" });
    return board;
  });

  app.post("/api/boards", async (req, reply) => {
    const body = CreateBoard.parse(req.body);
    const id = nanoid();
    const workspacePath = resolve(DATA_DIR, "workspaces", id);
    mkdirSync(workspacePath, { recursive: true });

    db.prepare(
      "INSERT INTO boards (id, name, workspace_path) VALUES (?, ?, ?)"
    ).run(id, body.name, workspacePath);

    const defaultColumns = ["Todo", "In Progress", "Review", "Done"];
    const insertCol = db.prepare(
      "INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)"
    );
    defaultColumns.forEach((name, i) =>
      insertCol.run(nanoid(), id, name, i)
    );

    return reply
      .status(201)
      .send(db.prepare("SELECT * FROM boards WHERE id = ?").get(id));
  });

  app.patch<{ Params: { id: string } }>("/api/boards/:id", async (req, reply) => {
    const body = CreateBoard.parse(req.body);
    const result = db
      .prepare("UPDATE boards SET name = ? WHERE id = ?")
      .run(body.name, req.params.id);
    if (result.changes === 0)
      return reply.status(404).send({ error: "Board not found" });
    return db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/boards/:id", async (req, reply) => {
    db.prepare("DELETE FROM boards WHERE id = ?").run(req.params.id);
    return reply.status(204).send();
  });
}
