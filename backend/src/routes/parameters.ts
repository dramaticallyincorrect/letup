import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { saveValues } from "../parameters/store.js";
import { getDb } from "../db/client.js";
import { PipelineDefinitionSchema } from "../pipelines/schema.js";

const SaveParams = z.object({
  scope: z.enum(["pipeline", "board"]),
  scopeId: z.string().min(1),
  values: z.record(z.string(), z.string()),
});

export async function parameterRoutes(app: FastifyInstance) {
  const db = getDb();

  app.post("/api/parameters", async (req, reply) => {
    const { scope, scopeId, values } = SaveParams.parse(req.body);

    // Determine param defs to know which keys are secret
    let paramDefs: { key: string; type: "string" | "secret" }[] = [];

    if (scope === "pipeline") {
      const row = db
        .prepare("SELECT definition_json FROM pipelines WHERE column_id = ?")
        .get(scopeId) as { definition_json: string } | undefined;
      if (row) {
        const pipeline = PipelineDefinitionSchema.parse(JSON.parse(row.definition_json));
        paramDefs = pipeline.parameters.map((p) => ({ key: p.key, type: p.type }));
      }
    }
    // board scope param defs come in Phase 7

    saveValues(scope, scopeId, values, paramDefs);
    return reply.status(204).send();
  });
}
