import Fastify from "fastify";
import cors from "@fastify/cors";
import { boardRoutes } from "./routes/boards.js";
import { columnRoutes } from "./routes/columns.js";
import { cardRoutes } from "./routes/cards.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { executionRoutes } from "./routes/executions.js";
import { parameterRoutes } from "./routes/parameters.js";
import { setupRoutes } from "./routes/setup.js";
import { ZodError } from "zod";

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: "http://localhost:5173" });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.status(400).send({ error: "Validation error", details: err.errors });
  }
  app.log.error(err);
  return reply.status(500).send({ error: "Internal server error" });
});

await app.register(boardRoutes);
await app.register(columnRoutes);
await app.register(cardRoutes);
await app.register(pipelineRoutes);
await app.register(executionRoutes);
await app.register(parameterRoutes);
await app.register(setupRoutes);

const PORT = Number(process.env.PORT ?? 3001);
await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`Backend running on http://127.0.0.1:${PORT}`);
