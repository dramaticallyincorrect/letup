import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/client.js";
import { buildBoardFromPrompt } from "../agents/builders/board.js";
import { compileRendererTsx } from "../utils/renderer.js";
import type { BoardDefinition } from "../pipelines/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../..", "data");

const CreateBoard = z.object({ name: z.string().min(1) });

const PatchBoard = z.object({
  name: z.string().min(1).optional(),
  setup_pipeline_json: z.string().nullable().optional(),
  parameters_json: z.string().optional(),
});

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
    const body = PatchBoard.parse(req.body);
    const existing = db.prepare("SELECT id FROM boards WHERE id = ?").get(req.params.id);
    if (!existing) return reply.status(404).send({ error: "Board not found" });

    if (body.name !== undefined) {
      db.prepare("UPDATE boards SET name = ? WHERE id = ?").run(body.name, req.params.id);
    }
    if (body.setup_pipeline_json !== undefined) {
      db.prepare("UPDATE boards SET setup_pipeline_json = ?, setup_status = 'idle' WHERE id = ?")
        .run(body.setup_pipeline_json, req.params.id);
    }
    if (body.parameters_json !== undefined) {
      db.prepare("UPDATE boards SET parameters_json = ? WHERE id = ?")
        .run(body.parameters_json, req.params.id);
    }

    return db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/boards/:id", async (req, reply) => {
    db.prepare("DELETE FROM boards WHERE id = ?").run(req.params.id);
    return reply.status(204).send();
  });

  app.post("/api/boards/from-prompt", async (req, reply) => {
    const { prompt } = z.object({ prompt: z.string().min(1) }).parse(req.body);

    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    const write = (obj: object) => reply.raw.write(JSON.stringify(obj) + "\n");

    try {
      const definition = await buildBoardFromPrompt(prompt, (text) => {
        write({ type: "log", text });
      });

      const board = await instantiateBoard(definition);
      write({ type: "result", board });
    } catch (err) {
      write({ type: "error", message: String(err) });
    } finally {
      reply.raw.end();
    }
  });

  async function instantiateBoard(def: BoardDefinition) {
    const id = nanoid();
    const workspacePath = resolve(DATA_DIR, "workspaces", id);
    mkdirSync(workspacePath, { recursive: true });

    db.prepare("INSERT INTO boards (id, name, workspace_path, parameters_json, setup_pipeline_json) VALUES (?, ?, ?, ?, ?)").run(
      id,
      def.name,
      workspacePath,
      def.parameters.length > 0 ? JSON.stringify(def.parameters) : "[]",
      def.setup_pipeline ? JSON.stringify(def.setup_pipeline) : null,
    );

    const insertCol = db.prepare(
      "INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)"
    );
    const insertPipeline = db.prepare(
      "INSERT INTO pipelines (id, column_id, definition_json, renderer_js) VALUES (?, ?, ?, ?)"
    );

    for (let i = 0; i < def.columns.length; i++) {
      const col = def.columns[i];
      const colId = nanoid();
      insertCol.run(colId, id, col.name, i);
      if (col.pipeline) {
        const rendererJs =
          col.pipeline.type === "agent" && col.pipeline.renderer_tsx
            ? await compileRendererTsx(col.pipeline.renderer_tsx)
            : null;
        insertPipeline.run(nanoid(), colId, JSON.stringify(col.pipeline), rendererJs);
      }
    }

    return db.prepare("SELECT * FROM boards WHERE id = ?").get(id);
  }
}
