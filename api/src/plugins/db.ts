import fp from 'fastify-plugin'
import { db } from '../db'
import type { DB } from '../db'
import { initCurrentUser } from '../currentUser'

declare module 'fastify' {
  interface FastifyInstance {
    db: DB
  }
}

export default fp(async (fastify) => {
  fastify.decorate('db', db)
  await initCurrentUser(db)
})
