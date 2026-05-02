import { FastifyBaseLogger, FastifyInstance, FastifyTypeProviderDefault, RawServerDefault } from "fastify";
import { IncomingMessage, ServerResponse } from "http";

export type Fastify = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  FastifyTypeProviderDefault
>