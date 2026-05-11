import type { FastifyPluginAsync } from 'fastify'
import { eq, desc, sql, and } from 'drizzle-orm'
import { apps, users, appVersions, userAppInstalls, marketplaceSubmissions, marketplaceListings, marketplaceStats } from '../db/schema'
import { getCurrentUserId } from '../currentUser'
import { Fastify } from '../fastify_type'

const marketplacePlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  submitApp(fastify)
  getAppSubmission(fastify)
  approveSubmission(fastify)
  getMarketplaceListings(fastify)
  installMarketplaceListing(fastify)
  getSubmissions(fastify)
}

function submitApp(fastify: Fastify) {
  fastify.post<{ Params: { appId: string }; Body: { category: string; description: string } }>(
    '/apps/:appId/submit',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'Submit an app to the marketplace',
        params: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] },
        body: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['category', 'description'],
        },
      },
    },
    async (request, reply) => {
      const { appId } = request.params
      const { category, description } = request.body
      const userId = getCurrentUserId()

      const [app] = await fastify.db
        .select({ id: apps.id, creatorId: apps.creatorId })
        .from(apps)
        .where(eq(apps.id, appId))

      if (!app) return reply.status(404).send({ error: 'App not found' })
      if (app.creatorId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      const [latestVersion] = await fastify.db
        .select({ isDraft: appVersions.isDraft })
        .from(appVersions)
        .where(eq(appVersions.appId, appId))
        .orderBy(desc(appVersions.versionNumber))
        .limit(1)

      if (!latestVersion || latestVersion.isDraft) return reply.status(400).send({ error: 'App must be published before submitting' })

      const existing = await fastify.db
        .select()
        .from(marketplaceSubmissions)
        .where(eq(marketplaceSubmissions.appId, appId))

      if (existing.length > 0) {
        const [updated] = await fastify.db
          .update(marketplaceSubmissions)
          .set({ category, description, status: 'pending', approvedAt: null, updatedAt: new Date() })
          .where(eq(marketplaceSubmissions.appId, appId))
          .returning()
        return reply.status(200).send(updated)
      }

      const [submission] = await fastify.db
        .insert(marketplaceSubmissions)
        .values({ appId, submittedBy: userId, category, description })
        .returning()

      return reply.status(201).send(submission)
    },
  )
}

function getAppSubmission(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>(
    '/apps/:appId/submission',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'Get marketplace submission status for an app',
        params: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] },
      },
    },
    async (request, reply) => {
      const { appId } = request.params

      const [submission] = await fastify.db
        .select()
        .from(marketplaceSubmissions)
        .where(eq(marketplaceSubmissions.appId, appId))

      if (!submission) return reply.status(404).send({ error: 'No submission found' })
      return reply.send(submission)
    },
  )
}

function approveSubmission(fastify: Fastify) {
  fastify.post<{ Params: { submissionId: string } }>(
    '/marketplace/submissions/:submissionId/approve',
    {
      schema: {
        tags: ['marketplace', 'submissions'],
        summary: 'Approve a marketplace submission (admin)',
        params: { type: 'object', properties: { submissionId: { type: 'string' } }, required: ['submissionId'] },
      },
    },
    async (request, reply) => {
      const { submissionId } = request.params

      const [submission] = await fastify.db
        .select()
        .from(marketplaceSubmissions)
        .where(eq(marketplaceSubmissions.id, submissionId))

      if (!submission) return reply.status(404).send({ error: 'Submission not found' })
      if (submission.status === 'approved') return reply.status(400).send({ error: 'Already approved' })

      await fastify.db
        .update(marketplaceSubmissions)
        .set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(marketplaceSubmissions.id, submissionId))

      const existing = await fastify.db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.appId, submission.appId))

      let listing
      if (existing.length > 0) {
        const [updated] = await fastify.db
          .update(marketplaceListings)
          .set({ category: submission.category, description: submission.description })
          .where(eq(marketplaceListings.appId, submission.appId))
          .returning()
        listing = updated
      } else {
        const [inserted] = await fastify.db
          .insert(marketplaceListings)
          .values({ appId: submission.appId, category: submission.category, description: submission.description })
          .returning()
        listing = inserted
      }

      return reply.status(200).send(listing)
    },
  )
}

function getMarketplaceListings(fastify: Fastify) {
  fastify.get(
    '/marketplace/listings',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'List all approved marketplace apps',
      },
    },
    async (_request, reply) => {
      const rows = await fastify.db
        .select({
          id: marketplaceListings.id,
          appId: marketplaceListings.appId,
          category: marketplaceListings.category,
          description: marketplaceListings.description,
          appName: apps.name,
          appCreatorHandle: users.handle,
          totalInstalls: sql<number>`coalesce(sum(${marketplaceStats.installs}), 0)`.mapWith(Number),
          avgRating: sql<number | null>`avg(${marketplaceStats.rating}::numeric)`,
        })
        .from(marketplaceListings)
        .innerJoin(apps, eq(apps.id, marketplaceListings.appId))
        .innerJoin(users, eq(users.id, apps.creatorId))
        .leftJoin(marketplaceStats, eq(marketplaceStats.appId, marketplaceListings.appId))
        .groupBy(marketplaceListings.id, apps.name, users.handle)
        .orderBy(desc(marketplaceListings.id))

      return reply.send(rows)
    },
  )
}

function installMarketplaceListing(fastify: Fastify) {
  fastify.post<{ Params: { appId: string } }>(
    '/marketplace/listings/:appId/install',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'Record a marketplace install for an app',
        params: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] },
      },
    },
    async (request, reply) => {
      const { appId } = request.params
      const today = new Date().toISOString().slice(0, 10)

      const [listing] = await fastify.db
        .select({ id: marketplaceListings.id })
        .from(marketplaceListings)
        .where(eq(marketplaceListings.appId, appId))

      if (!listing) return reply.status(404).send({ error: 'Not in marketplace' })

      const [latestVersion] = await fastify.db
        .select({ id: appVersions.id })
        .from(appVersions)
        .where(and(eq(appVersions.appId, appId), sql`${appVersions.isDraft} is not true`))
        .orderBy(desc(appVersions.versionNumber))
        .limit(1)

      if (!latestVersion) return reply.status(400).send({ error: 'App has no published version' })

      const userId = getCurrentUserId()

      await fastify.db
        .insert(userAppInstalls)
        .values({ userId, versionId: latestVersion.id })
        .onConflictDoNothing()

      await fastify.db
        .insert(marketplaceStats)
        .values({ appId, date: today, installs: 1 })
        .onConflictDoUpdate({
          target: [marketplaceStats.appId, marketplaceStats.date],
          set: { installs: sql`${marketplaceStats.installs} + 1` },
        })

      return reply.status(200).send({ ok: true })
    },
  )
}

function getSubmissions(fastify: Fastify) {
  fastify.get(
    '/marketplace/submissions',
    {
      schema: {
        tags: ['marketplace', 'submissions'],
        summary: 'List all marketplace submissions',
      },
    },
    async (_request, reply) => {
      const rows = await fastify.db
        .select().from(marketplaceSubmissions)

      return reply.send(rows)
    },
  )
}

export default marketplacePlugin
