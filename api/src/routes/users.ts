import { type FastifyPluginAsync } from 'fastify'
import { eq, desc } from 'drizzle-orm'
import { users, apps, appVersions, userAppInstalls } from '../db/schema'
import { Fastify } from '../fastify_type'

const usersPlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  createUser(fastify)
  getUser(fastify)
  getUserInstalls(fastify)
}

function createUser(fastify: Fastify) {
  fastify.post<{ Body: { handle: string; displayName: string } }>('/users', {
    schema: {
      tags: ['users'],
      summary: 'Create a new user',
      body: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          displayName: { type: 'string' },
        },
        required: ['handle', 'displayName'],
      },
    },
  }, async (request, reply) => {
    const { handle, displayName } = request.body
    const [user] = await fastify.db
      .insert(users)
      .values({ handle, displayName })
      .returning()
    return reply.code(201).send(user)
  })
}

function getUser(fastify: Fastify) {
  fastify.get<{ Params: { userId: string } }>('/users/:userId', {
    schema: { tags: ['users'], summary: 'Get a user by ID' },
  }, async (request, reply) => {
    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, request.params.userId))
    if (!user) return reply.code(404).send({ error: 'user not found' })
    return reply.send(user)
  })
}

function getUserInstalls(fastify: Fastify) {
  fastify.get<{ Params: { userId: string } }>('/users/:userId/installs', {
    schema: { tags: ['users'], summary: 'List apps installed by a user' },
  }, async (request, reply) => {
    const rows = await fastify.db
      .select({
        userId: userAppInstalls.userId,
        versionId: userAppInstalls.versionId,
        installedAt: userAppInstalls.installedAt,
        versionNumber: appVersions.versionNumber,
        appId: apps.id,
        appName: apps.name,
        appDescription: apps.description,
        appStatus: apps.status,
        latestVersionNumber: apps.latestVersionNumber,
        appCreatedAt: apps.createdAt,
        appUpdatedAt: apps.updatedAt,
      })
      .from(userAppInstalls)
      .innerJoin(appVersions, eq(userAppInstalls.versionId, appVersions.id))
      .innerJoin(apps, eq(appVersions.appId, apps.id))
      .where(eq(userAppInstalls.userId, request.params.userId))
      .orderBy(desc(userAppInstalls.installedAt))
    return reply.send(rows)
  })
}

export default usersPlugin
