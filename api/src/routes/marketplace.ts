import type { FastifyPluginAsync } from 'fastify'
import { eq, desc, sql, and, countDistinct } from 'drizzle-orm'
import { apps, appVersions, userAppInstalls, marketplaceSubmissions, marketplaceListings, marketplaceStats, userSubscriptions, aiUsageLogs } from '../db/schema'
import { user as users } from '../db/auth-schema'
import { Fastify } from '../fastify_type'

const marketplacePlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  submitApp(fastify)
  getAppSubmission(fastify)
  getMySubmissions(fastify)
  approveSubmission(fastify)
  rejectSubmission(fastify)
  getMarketplaceListings(fastify)
  installMarketplaceListing(fastify)
  getSubmissions(fastify)
  getSubmissionHistory(fastify)
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
      const userId = request.assertAuthenticated()

      const [app] = await fastify.db
        .select({ id: apps.id, creatorId: apps.creatorId })
        .from(apps)
        .where(eq(apps.id, appId))

      if (!app) return reply.status(404).send({ error: 'App not found' })
      if (app.creatorId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      const [latestVersion] = await fastify.db
        .select({ isDraft: appVersions.isDraft, id: appVersions.id })
        .from(appVersions)
        .where(eq(appVersions.appId, appId))
        .orderBy(desc(appVersions.versionNumber))
        .limit(1)

      if (!latestVersion || latestVersion.isDraft) return reply.status(400).send({ error: 'Drafts cannot be submitted to marketplace' })

      const [submission] = await fastify.db
        .insert(marketplaceSubmissions)
        .values({ appId, versionId: latestVersion.id, submittedBy: userId, category, description })
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
      request.assertAuthenticated()
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

function getMySubmissions(fastify: Fastify) {
  fastify.get(
    '/marketplace/my-submissions',
    {
      schema: {
        tags: ['marketplace'],
        summary: 'Get all submission statuses for the authenticated user\'s apps',
      },
    },
    async (request, reply) => {
      const userId = request.assertAuthenticated()

      const rows = await fastify.db
        .select()
        .from(marketplaceSubmissions)
        .where(eq(marketplaceSubmissions.submittedBy, userId))

      return reply.send(rows)
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
      request.assertAdmin()
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

      const [buildLog] = await fastify.db
        .select({ model: aiUsageLogs.model })
        .from(aiUsageLogs)
        .where(and(eq(aiUsageLogs.appVersionId, submission.versionId), eq(aiUsageLogs.source, 'build')))
        .orderBy(desc(aiUsageLogs.createdAt))
        .limit(1)
      const model = buildLog?.model ?? null

      const existing = await fastify.db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.appId, submission.appId))

      let listing
      if (existing.length > 0) {
        const [updated] = await fastify.db
          .update(marketplaceListings)
          .set({ category: submission.category, description: submission.description, appVersionId: submission.versionId, model })
          .where(eq(marketplaceListings.appId, submission.appId))
          .returning()
        listing = updated
      } else {
        const [inserted] = await fastify.db
          .insert(marketplaceListings)
          .values({ appId: submission.appId, category: submission.category, description: submission.description, appVersionId: submission.versionId, model })
          .returning()
        listing = inserted
      }

      return reply.status(200).send(listing)
    },
  )
}

function rejectSubmission(fastify: Fastify) {
  fastify.post<{ Params: { submissionId: string } }>(
    '/marketplace/submissions/:submissionId/reject',
    {
      schema: {
        tags: ['marketplace', 'submissions'],
        summary: 'Reject a marketplace submission (admin)',
        params: { type: 'object', properties: { submissionId: { type: 'string' } }, required: ['submissionId'] },
      },
    },
    async (request, reply) => {
      request.assertAdmin()
      const { submissionId } = request.params

      const [submission] = await fastify.db
        .select()
        .from(marketplaceSubmissions)
        .where(eq(marketplaceSubmissions.id, submissionId))

      if (!submission) return reply.status(404).send({ error: 'Submission not found' })
      if (submission.status === 'rejected') return reply.status(400).send({ error: 'Already rejected' })

      const [updated] = await fastify.db
        .update(marketplaceSubmissions)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(marketplaceSubmissions.id, submissionId))
        .returning()

      return reply.status(200).send(updated)
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
          model: marketplaceListings.model,
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

      const userId = request.assertAuthenticated()

      const [sub] = await fastify.db
        .select({ plan: userSubscriptions.plan })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .limit(1)

      if (!sub || sub.plan === 'free') {
        const [{ count }] = await fastify.db
          .select({ count: countDistinct(appVersions.appId) })
          .from(userAppInstalls)
          .innerJoin(appVersions, eq(userAppInstalls.versionId, appVersions.id))
          .where(eq(userAppInstalls.userId, userId))

        if (count >= 3) {
          return reply.status(403).send({ error: 'Free plan is limited to 3 installed apps. Uninstall one or upgrade to Pro.' })
        }
      }

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
        summary: 'List all marketplace submissions (admin)',
      },
    },
    async (request, reply) => {
      request.assertAdmin()

      const rows = await fastify.db
        .select({
          id: marketplaceSubmissions.id,
          appId: marketplaceSubmissions.appId,
          versionId: marketplaceSubmissions.versionId,
          submittedBy: marketplaceSubmissions.submittedBy,
          category: marketplaceSubmissions.category,
          description: marketplaceSubmissions.description,
          status: marketplaceSubmissions.status,
          approvedAt: marketplaceSubmissions.approvedAt,
          createdAt: marketplaceSubmissions.createdAt,
          updatedAt: marketplaceSubmissions.updatedAt,
          appName: apps.name,
          submitterHandle: users.handle,
        })
        .from(marketplaceSubmissions)
        .innerJoin(apps, eq(apps.id, marketplaceSubmissions.appId))
        .innerJoin(users, eq(users.id, marketplaceSubmissions.submittedBy))
        .orderBy(desc(marketplaceSubmissions.createdAt))

      return reply.send(rows)
    },
  )
}

// ── Conversation history sanitisation ──────────────────────────────────────

const CODE_TOOLS = new Set([
  'write_file', 'str_replace', 'append_text',
  'read_file', 'read_file_range', 'list_files',
  'grep_file', 'search_files', 'setup_database',
])

type SafeHistoryEntry =
  | { kind: 'user_message'; text: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'file_action'; tool: string; path: string }
  | { kind: 'ask_user'; question: string; suggestions?: string[] }
  | { kind: 'user_answer'; answer: string }

function sanitizeHistory(raw: unknown[]): SafeHistoryEntry[] {
  const entries: SafeHistoryEntry[] = []
  const toolNames = new Map<string, string>() // tool_use_id → tool name

  for (const msg of raw) {
    const m = msg as { role: string; content: unknown }

    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        entries.push({ kind: 'user_message', text: m.content })
      } else if (Array.isArray(m.content)) {
        for (const block of m.content as { type: string; text?: string; tool_use_id?: string; content?: unknown }[]) {
          if (block.type === 'text' && block.text) {
            entries.push({ kind: 'user_message', text: block.text })
          } else if (block.type === 'tool_result' && toolNames.get(block.tool_use_id ?? '') === 'ask_user') {
            let answer = ''
            if (typeof block.content === 'string') {
              try { answer = (JSON.parse(block.content) as { answer?: string }).answer ?? block.content } catch { answer = block.content }
            }
            entries.push({ kind: 'user_answer', answer })
          }
          // all other tool_results contain code — skip
        }
      }
    } else if (m.role === 'assistant') {
      const blocks = typeof m.content === 'string'
        ? [{ type: 'text', text: m.content }]
        : (m.content as unknown[])

      for (const block of blocks as { type: string; text?: string; id?: string; name?: string; input?: unknown }[]) {
        if (block.type === 'text' && block.text) {
          entries.push({ kind: 'assistant_text', text: block.text })
        } else if (block.type === 'tool_use' && block.name) {
          toolNames.set(block.id ?? '', block.name)
          if (block.name === 'ask_user') {
            const input = block.input as { question?: string; suggestions?: string[] }
            entries.push({ kind: 'ask_user', question: input?.question ?? '', suggestions: input?.suggestions })
          } else if (CODE_TOOLS.has(block.name)) {
            const input = block.input as Record<string, unknown>
            const path = String(input?.path ?? input?.file_path ?? input?.filename ?? '')
            entries.push({ kind: 'file_action', tool: block.name, path })
          }
          // thinking blocks (type === 'thinking') are silently dropped
        }
      }
    }
  }

  return entries
}

function getSubmissionHistory(fastify: Fastify) {
  fastify.get<{ Params: { submissionId: string } }>(
    '/marketplace/submissions/:submissionId/history',
    {
      schema: {
        tags: ['marketplace', 'submissions'],
        summary: 'Get sanitised conversation history for a submission (admin)',
        params: { type: 'object', properties: { submissionId: { type: 'string' } }, required: ['submissionId'] },
      },
    },
    async (request, reply) => {
      request.assertAdmin()
      const { submissionId } = request.params

      const [row] = await fastify.db
        .select({
          appId: marketplaceSubmissions.appId,
          appName: apps.name,
          submitterHandle: users.handle,
          category: marketplaceSubmissions.category,
          description: marketplaceSubmissions.description,
          status: marketplaceSubmissions.status,
          createdAt: marketplaceSubmissions.createdAt,
          conversationHistory: apps.conversationHistory,
        })
        .from(marketplaceSubmissions)
        .innerJoin(apps, eq(apps.id, marketplaceSubmissions.appId))
        .innerJoin(users, eq(users.id, marketplaceSubmissions.submittedBy))
        .where(eq(marketplaceSubmissions.id, submissionId))

      if (!row) return reply.status(404).send({ error: 'Submission not found' })

      const history = Array.isArray(row.conversationHistory) ? row.conversationHistory : []
      return reply.send({
        appName: row.appName,
        submitterHandle: row.submitterHandle,
        category: row.category,
        description: row.description,
        status: row.status,
        createdAt: row.createdAt,
        history: sanitizeHistory(history),
      })
    },
  )
}

export default marketplacePlugin
