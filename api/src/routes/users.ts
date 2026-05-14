import { type FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { user as userTable } from '../db/auth-schema'
import { Fastify } from '../fastify_type'

const usersPlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  getUser(fastify)
}

function getUser(fastify: Fastify) {
  fastify.get('/me', async (request, reply) => {
    const userId = request.assertAuthenticated()
    const [user] = await fastify.db.select().from(userTable).where(eq(userTable.id, userId))
    if (!user) return reply.code(404).send({ error: 'user not found' })
    return reply.send(user)
  })
}

export default usersPlugin
