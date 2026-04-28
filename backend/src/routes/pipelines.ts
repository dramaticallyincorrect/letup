import type { FastifyInstance } from "fastify";
import { PassThrough } from "stream";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { PipelineDefinitionSchema, type PipelineDefinition } from "../pipelines/schema.js";
import { buildPipelineFromPrompt } from "../agents/builders/pipeline.js";
import { compileRendererTsx } from "../utils/renderer.js";

async function resolveRendererJs(definition: PipelineDefinition): Promise<string | null> {
  if (definition.type === "agent" && definition.renderer_tsx) {
    return compileRendererTsx(definition.renderer_tsx);
  }
  return null;
}

function upsertPipeline(
  db: ReturnType<typeof getDb>,
  columnId: string,
  definition: PipelineDefinition,
  rendererJs: string | null
) {
  const existing = db.prepare("SELECT id FROM pipelines WHERE column_id = ?").get(columnId);
  if (existing) {
    db.prepare(
      "UPDATE pipelines SET definition_json = ?, renderer_js = ? WHERE column_id = ?"
    ).run(JSON.stringify(definition), rendererJs, columnId);
  } else {
    db.prepare(
      "INSERT INTO pipelines (id, column_id, definition_json, renderer_js) VALUES (?, ?, ?, ?)"
    ).run(nanoid(), columnId, JSON.stringify(definition), rendererJs);
  }
}

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
      const rendererJs = await resolveRendererJs(definition);
      upsertPipeline(db, req.params.columnId, definition, rendererJs);

      return db.prepare("SELECT * FROM pipelines WHERE column_id = ?").get(req.params.columnId);
    }
  );

  app.delete<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/pipeline",
    async (req, reply) => {
      db.prepare("DELETE FROM pipelines WHERE column_id = ?").run(req.params.columnId);
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { columnId: string } }>(
    "/api/columns/:columnId/pipeline/from-prompt",
    async (req, reply) => {
      const col = db
        .prepare("SELECT id FROM columns WHERE id = ?")
        .get(req.params.columnId);
      if (!col) return reply.status(404).send({ error: "Column not found" });

      const { prompt } = req.body as { prompt: string };
      if (!prompt?.trim()) return reply.status(400).send({ error: "prompt is required" });

      const stream = new PassThrough();
      reply
        .header("Content-Type", "application/x-ndjson")
        .header("Cache-Control", "no-cache")
        .send(stream);

      const write = (data: object) => stream.write(JSON.stringify(data) + "\n");

      try {
        const definition = await buildPipelineFromPrompt(prompt, (text) => {
          write({ type: "log", text });
        });

        const rendererJs = await resolveRendererJs(definition);
        upsertPipeline(db, req.params.columnId, definition, rendererJs);

        write({ type: "result", definition });
      } catch (err) {
        write({ type: "error", message: String(err) });
      }

      stream.end();
    }
  );

  app.get<{ Params: { boardId: string } }>(
    "/api/boards/:boardId/pipelines",
    async (req) => {
      const rows = db
        .prepare(
          `SELECT pipelines.* FROM pipelines
           JOIN columns ON pipelines.column_id = columns.id
           WHERE columns.board_id = ?`
        )
        .all(req.params.boardId) as {
          column_id: string;
          definition_json: string;
          renderer_js: string | null;
          id: string;
          created_at: string;
        }[];
      return Object.fromEntries(rows.map((r) => [r.column_id, r]));
    }
  );
}
