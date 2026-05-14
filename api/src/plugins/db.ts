import fp from 'fastify-plugin'
import { db } from '../db'
import type { DB } from '../db'

declare module 'fastify' {
  interface FastifyInstance {
    db: DB
  }
}

export default fp(async (fastify) => {
  fastify.decorate('db', db)
})
