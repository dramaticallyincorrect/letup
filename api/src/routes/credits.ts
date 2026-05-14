import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { Fastify } from '../fastify_type'
import { userCredits } from '../db/schema'

const creditsPlugin: FastifyPluginAsync = async (fastify) => {
  getCredits(fastify)
  grantCredits(fastify)
}

function getCredits(fastify: Fastify) {
  fastify.get('/credits', {
    schema: {
      tags: ['credits'],
      summary: 'Get credit balance for the current user',
    },
  }, async (request, reply) => {
    const userId = request.assertAuthenticated()
    const result = await fastify.db.execute(sql`
      SELECT balance FROM user_credits WHERE user_id = ${userId}
    `)
    const microUnitsBalance = result.length > 0 ? String(result[0].balance) : '0'
    const credits = Math.floor(Number(microUnitsBalance) / 1000)
    return reply.send({ credits, microUnitsBalance })
  })
}

function grantCredits(fastify: Fastify) {
  fastify.post<{ Body: { userId?: string; amount: number } }>('/credits/grant', {
    schema: {
      tags: ['credits'],
      summary: 'Grant credits to a user (admin/testing)',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID to grant credits to (defaults to current user)' },
          amount: { type: 'number', description: 'Number of micro-units to add' },
        },
        required: ['amount'],
      },
    },
  }, async (request, reply) => {
    const userId = request.body.userId ?? request.assertAuthenticated()
    const amount = BigInt(Math.floor(request.body.amount))

    await fastify.db
      .insert(userCredits)
      .values({ userId, balance: amount })
      .onConflictDoUpdate({
        target: userCredits.userId,
        set: { balance: sql`user_credits.balance + ${amount}`, updatedAt: new Date() },
      })

    const result = await fastify.db.execute(sql`
      SELECT balance FROM user_credits WHERE user_id = ${userId}
    `)
    const microUnitsBalance = String(result[0].balance)
    const credits = Math.floor(Number(microUnitsBalance) / 1000)
    return reply.send({ credits, microUnitsBalance })
  })
}

export default creditsPlugin
