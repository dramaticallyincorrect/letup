import {
  type FastifyPluginAsync,
} from 'fastify'
import { readFileSync, unlinkSync, rmSync } from 'node:fs'
import { join, posix } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { build } from 'esbuild'
import Anthropic from '@anthropic-ai/sdk'
import { apps, appVersions, userAppInstalls } from '../db/schema'
import { openDb, getDbPath, openDraftDb, getDraftDbPath, copyPublishedToDraft, copyDraftToPublished } from '../db/appDb'
import { getCurrentUserId } from '../currentUser'
import { runAgentLoop, cached, markLastTurnCacheable } from '../agent'
import { hasCredits, checkAndDeductCredits, logUsage, tokensToMicroUnits, InsufficientCreditsError } from '../credits'
import { createShadcnMcpTools } from '../shadcnMcp'
import { Fastify } from '../fastify_type'

// System prompts — loaded once, wrapped with cache_control for prompt caching
const PLAN_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-plan.md'), 'utf8'))
const BUILD_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-build.md'), 'utf8'))

// Deferred promises waiting for user answers, keyed by question ID
const pendingQuestions = new Map<string, (answer: string) => void>()

const appsPlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  listApps(fastify)
  createApp(fastify)
  createDraft(fastify)
  getApp(fastify)
  getAppForEdit(fastify)
  patchApp(fastify)
  installApp(fastify)
  deleteApp(fastify)
  buildApp(fastify)
  answerAppQuestion(fastify)
  queryAppDb(fastify)
  appManifest(fastify)
}

function sseHeaders(origin?: string) {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': origin ?? '*',
  }
}

function listApps(fastify: Fastify) {
  fastify.get('/apps', {
    schema: { tags: ['apps'], summary: 'List apps for the current user' },
  }, async (_request, reply) => {
    const result = await fastify.db
      .select({
        id: apps.id,
        creatorId: apps.creatorId,
        name: apps.name,
        description: apps.description,
        status: apps.status,
        latestVersionNumber: apps.latestVersionNumber,
        createdAt: apps.createdAt,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .where(eq(apps.creatorId, getCurrentUserId()))
      .orderBy(desc(apps.createdAt))
    return reply.send(result)
  })
}

function appManifest(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId/manifest', {
    schema: { tags: ['apps'], summary: 'List apps for the current user' },
  }, async (request, reply) => {
    const { appId } = request.params


    const result = await fastify.db
      .select({
        id: apps.id,
        creatorId: apps.creatorId,
        name: apps.name,
        description: apps.description,
        status: apps.status,
        latestVersionNumber: apps.latestVersionNumber,
        createdAt: apps.createdAt,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)

    const app = result[0]

    return reply
      .type('application/manifest+json')
      .send(
        {
          "id": `http://localhost:5173/apps/${app.id}/`,
          "name": app.name,
          "short_name": `SubSite ${app.id}`,
          "scope": `http://localhost:5173/apps/${appId}/`,
          "start_url": `http://localhost:5173/apps/${app.id}/`,
          "display": "standalone",
          "background_color": "#ffffff",
          "description": app.description,
          "icons": [
            {
              "src": "https://picsum.photos/192",
              "sizes": "192x192",
              "type": "image/png"
            },
            {
              "src": "https://picsum.photos/512",
              "sizes": "512x512",
              "type": "image/png"
            }
          ]
        }
      )
  })
}

function createApp(fastify: Fastify) {
  fastify.post<{ Body: { name: string } }>('/apps', {
    schema: {
      tags: ['apps'],
      summary: 'Create a draft app for the current user',
      body: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const [app] = await fastify.db
      .insert(apps)
      .values({ name: request.body.name, creatorId: getCurrentUserId() })
      .returning()
    await fastify.db
      .insert(appVersions)
      .values({ appId: app.id, versionNumber: 1, isDraft: true })
    openDb(app.id).close()
    return reply.code(201).send(app)
  })
}

function createDraft(fastify: Fastify) {
  fastify.post<{ Params: { appId: string } }>('/apps/:appId/draft', {
    schema: { tags: ['apps'], summary: 'Create a new draft version from the current published version' },
  }, async (request, reply) => {
    const { appId } = request.params

    // Idempotent: return existing draft if one already exists
    const [latestVersion] = await fastify.db
      .select()
      .from(appVersions)
      .where(eq(appVersions.appId, appId))
      .orderBy(desc(appVersions.versionNumber))
      .limit(1)

    if (latestVersion.isDraft) return reply.send(latestVersion)

    const [draftVersion] = await fastify.db
      .insert(appVersions)
      .values({
        appId,
        versionNumber: latestVersion.versionNumber + 1,
        isDraft: true,
        sourceFiles: latestVersion.sourceFiles ?? [],
        compiledCode: latestVersion.compiledCode ?? null,
        cssCode: latestVersion.cssCode ?? null,
        dbSchema: latestVersion.dbSchema ?? null,
      })
      .returning()

    copyPublishedToDraft(appId)

    return reply.code(201).send(draftVersion)
  })
}

function getApp(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId', {
    schema: { tags: ['apps'], summary: 'Get an app by ID' },
  }, async (request, reply) => {
    const row = await loadAppWithVersion(fastify.db, request.params.appId)
    if (!row) return reply.code(404).send({ error: 'app not found' })
    return reply.send(row)
  })
}

function getAppForEdit(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId/edit', {
    schema: { tags: ['apps'], summary: 'Get an app by ID including conversation history (prefers draft version)' },
  }, async (request, reply) => {
    const { appId } = request.params
    const appRow = await fastify.db
      .select({ latestVersionNumber: apps.latestVersionNumber })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!appRow) return reply.code(404).send({ error: 'app not found' })

    const [draftVersion] = await fastify.db
      .select({ versionNumber: appVersions.versionNumber })
      .from(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
      .limit(1)

    const versionNumber = draftVersion?.versionNumber ?? appRow.latestVersionNumber
    const row = await loadAppWithVersionNumber(fastify.db, appId, versionNumber)
    if (!row) return reply.code(404).send({ error: 'app not found' })
    return reply.send(row)
  })
}

function patchApp(fastify: Fastify) {
  fastify.patch<{
    Params: { appId: string }
    Body: { name?: string; description?: string }
  }>('/apps/:appId', {
    schema: {
      tags: ['apps'],
      summary: 'Update app name or description',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { appId } = request.params
    const patch = request.body
    const [updated] = await fastify.db
      .update(apps)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description }),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'app not found' })
    return reply.send(updated)
  })
}

function installApp(fastify: Fastify) {
  fastify.post<{ Params: { appId: string } }>('/apps/:appId/install', {
    schema: { tags: ['apps'], summary: 'Install latest app version and publish it' },
  }, async (request, reply) => {
    const { appId } = request.params
    const userId = getCurrentUserId()

    const [draftVersion] = await fastify.db
      .select({ id: appVersions.id, versionNumber: appVersions.versionNumber })
      .from(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
      .limit(1)

    if (!draftVersion) return reply.code(400).send({ error: 'No draft version to install — build the app first' })

    copyDraftToPublished(appId)

    await fastify.db
      .update(appVersions)
      .set({ isDraft: false })
      .where(eq(appVersions.id, draftVersion.id))

    await fastify.db
      .insert(userAppInstalls)
      .values({ userId, versionId: draftVersion.id })
      .onConflictDoNothing()

    const [updated] = await fastify.db
      .update(apps)
      .set({ status: 'published', latestVersionNumber: draftVersion.versionNumber, updatedAt: new Date() })
      .where(eq(apps.id, appId))
      .returning()

    return reply.code(201).send(updated)
  })
}


function deleteApp(fastify: Fastify) {
  fastify.delete<{ Params: { appId: string } }>('/apps/:appId', {
    schema: { tags: ['apps'], summary: 'Delete an app' },
  }, async (request, reply) => {
    const { appId } = request.params
    await fastify.db.delete(apps).where(eq(apps.id, appId))
    try { unlinkSync(getDbPath(appId)) } catch { /* file may not exist */ }
    try { rmSync(getDraftDbPath(appId)) } catch { /* file may not exist */ }
    return reply.code(204).send()
  })
}

// ---------------------------------------------------------------------------
// Virtual filesystem helpers
// ---------------------------------------------------------------------------

function resolveVirtualPath(importerPath: string, importPath: string, files: Map<string, string>): string | null {
  const base = posix.dirname(importerPath)
  const joined = posix.normalize(posix.join(base, importPath))
  const stripped = joined.startsWith('./') ? joined.slice(2) : joined

  const candidates = [
    stripped,
    `${stripped}.tsx`,
    `${stripped}.ts`,
    `${stripped}.js`,
    `${stripped}/index.tsx`,
    `${stripped}/index.ts`,
  ]

  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate
  }
  return null
}

async function compileVirtualFiles(files: Map<string, string>): Promise<string> {
  const result = await build({
    entryPoints: ['index.tsx'],
    bundle: true,
    format: 'cjs',
    write: false,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    external: [
      'react', 'framer-motion',
      '@/components/ui/*', '@/lib/utils',
      'radix-ui', 'lucide-react',
      'class-variance-authority', 'tailwind-merge',
      'ai', 'db',
    ],
    plugins: [
      {
        name: 'virtual-fs',
        setup(b) {
          b.onResolve({ filter: /.*/ }, args => {
            if (args.namespace === 'virtual' && args.path.startsWith('.')) {
              const resolved = resolveVirtualPath(args.importer, args.path, files)
              if (resolved) return { path: resolved, namespace: 'virtual' }
              return { errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}"` }] }
            }
            if (files.has(args.path)) return { path: args.path, namespace: 'virtual' }
            return null
          })
          b.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
            const content = files.get(args.path)
            if (content == null) return { errors: [{ text: `File not found: ${args.path}` }] }
            const loader = args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : 'js'
            return { contents: content, loader }
          })
        },
      },
    ],
  })
  return result.outputFiles[0].text
}

// Removes cache_control from every content block so it doesn't accumulate in DB
// across refinements (each refinement re-applies it transiently via markLastTurnCacheable).
function stripCacheControl(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') return msg
    const content = (msg.content as unknown as Array<Record<string, unknown>>).map(block => {
      if ('cache_control' in block) {
        const { cache_control: _cc, ...rest } = block
        return rest
      }
      return block
    })
    return { ...msg, content } as unknown as Anthropic.MessageParam
  })
}

// ---------------------------------------------------------------------------
// Extract plain text from a completed agent loop's final assistant message
// ---------------------------------------------------------------------------
function extractText(messages: Anthropic.MessageParam[]): string {
  const last = messages.at(-1)
  if (!last || last.role !== 'assistant') return ''
  if (typeof last.content === 'string') return last.content
  return (last.content as Anthropic.ContentBlock[])
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// ---------------------------------------------------------------------------
// Shared helper — load app joined with its latest version
// ---------------------------------------------------------------------------

const APP_VERSION_COLUMNS = {
  id: apps.id,
  creatorId: apps.creatorId,
  name: apps.name,
  description: apps.description,
  status: apps.status,
  latestVersionNumber: apps.latestVersionNumber,
  conversationHistory: apps.conversationHistory,
  createdAt: apps.createdAt,
  updatedAt: apps.updatedAt,
  versionNumber: appVersions.versionNumber,
  isDraft: appVersions.isDraft,
  compiledCode: appVersions.compiledCode,
  cssCode: appVersions.cssCode,
  sourceFiles: appVersions.sourceFiles,
  dbSchema: appVersions.dbSchema,
}

async function loadAppWithVersion(db: import('../db').DB, appId: string) {
  const [row] = await db
    .select(APP_VERSION_COLUMNS)
    .from(apps)
    .leftJoin(
      appVersions,
      and(
        eq(appVersions.appId, apps.id),
        eq(appVersions.versionNumber, apps.latestVersionNumber),
      ),
    )
    .where(eq(apps.id, appId))
  return row ?? null
}

async function loadAppWithVersionNumber(db: import('../db').DB, appId: string, versionNumber: number) {
  const [row] = await db
    .select(APP_VERSION_COLUMNS)
    .from(apps)
    .leftJoin(
      appVersions,
      and(
        eq(appVersions.appId, apps.id),
        eq(appVersions.versionNumber, versionNumber),
      ),
    )
    .where(eq(apps.id, appId))
  return row ?? null
}

// ---------------------------------------------------------------------------
// Build app route
// ---------------------------------------------------------------------------

function buildApp(fastify: Fastify) {
  fastify.post<{ Body: { appId: string; userMessage: string; model?: string } }>('/apps/build', {
    schema: {
      tags: ['apps'],
      summary: 'Build or refine an app via AI agent (SSE)',
      body: {
        type: 'object',
        properties: {
          appId: { type: 'string' },
          userMessage: { type: 'string' },
          model: { type: 'string', description: 'Override the Claude model (e.g. claude-haiku-4-5-20251001)' },
        },
        required: ['appId', 'userMessage'],
      },
    },
  }, async (request, reply) => {
    const { appId, userMessage, model: modelOverride } = request.body
    const userId = getCurrentUserId()

    const app = await loadAppWithVersion(fastify.db, appId)
    if (!app) return reply.code(404).send({ error: 'app not found' })

    // Draft must already exist (created via POST /apps or POST /apps/:appId/draft)
    const [draftRow] = await fastify.db
      .select({ versionNumber: appVersions.versionNumber })
      .from(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
      .limit(1)
    if (!draftRow) return reply.code(400).send({ error: 'No draft version found — call POST /apps/:appId/draft first' })

    if (!(await hasCredits(fastify.db, userId))) {
      return reply.code(402).send({ error: 'Insufficient credits' })
    }

    const targetVersionNumber = draftRow.versionNumber

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const agentState = {
      name: app.name,
      description: app.description,
      compiledCode: app.compiledCode as string | null,
    }

    const virtualFiles = new Map<string, string>()

    // Seed with existing source files for refinement requests
    if (Array.isArray(app.sourceFiles)) {
      for (const f of app.sourceFiles as Array<{ path: string; content: string }>) {
        virtualFiles.set(f.path, f.content)
      }
    }

    const history = (Array.isArray(app.conversationHistory) ? app.conversationHistory : []) as Anthropic.MessageParam[]
    const isRefinement = history.length > 0
    // Cache the prior conversation so re-sent history is not re-billed on refinement.
    const cachedHistory = isRefinement ? markLastTurnCacheable(history) : history
    const messages: Anthropic.MessageParam[] = [...cachedHistory, { role: 'user', content: userMessage }]

    async function compileAndPersist(): Promise<{ success: true } | { error: string }> {
      try {
        const compiled = await compileVirtualFiles(virtualFiles)
        agentState.compiledCode = compiled
        const cssCode = virtualFiles.get('styles.css') ?? null
        const sourceFilesArray = [...virtualFiles.entries()].map(([path, content]) => ({ path, content }))
        await fastify.db
          .insert(appVersions)
          .values({ appId, versionNumber: targetVersionNumber, compiledCode: compiled, cssCode, sourceFiles: sourceFilesArray, isDraft: true })
          .onConflictDoUpdate({
            target: [appVersions.appId, appVersions.versionNumber],
            set: { compiledCode: compiled, cssCode, sourceFiles: sourceFilesArray, isDraft: true },
          })
        await fastify.db
          .update(apps)
          .set({ updatedAt: new Date() })
          .where(eq(apps.id, appId))
        return { success: true }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Compile failed' }
      }
    }

    const writeFileTool = {
      name: 'write_file',
      description: 'Write or overwrite a file in the app project. Entry point must be "index.tsx". Add files like "components/Card.tsx", "hooks/useData.ts" as needed.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
      handler: async (input: Record<string, unknown>) => {
        virtualFiles.set(input.path as string, input.content as string)
        return { success: true, path: input.path }
      },
    }

    const readFileTool = {
      name: 'read_file',
      description: 'Read a file previously written in this session.',
      input_schema: {
        type: 'object' as const,
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      handler: async (input: Record<string, unknown>) => ({
        content: virtualFiles.get(input.path as string) ?? null,
      }),
    }

    const listFilesTool = {
      name: 'list_files',
      description: 'List all files currently written in the app project.',
      input_schema: { type: 'object' as const, properties: {} },
      handler: async () => ({ files: [...virtualFiles.keys()] }),
    }

    const askUserTool = {
      name: 'ask_user',
      description: 'Ask the user a clarifying question before building. Use this when the request is ambiguous or missing key information needed to design the app. Ask at most 1-2 focused questions.',
      input_schema: {
        type: 'object' as const,
        properties: {
          question: { type: 'string', description: 'A specific, concise question for the user' },
        },
        required: ['question'],
      },
      handler: async (input: Record<string, unknown>) => {
        const questionId = crypto.randomUUID()
        const answer = await new Promise<string>(resolve => {
          pendingQuestions.set(questionId, resolve)
          sendEvent('user_question', { questionId, question: input.question as string })
        })
        return { answer }
      },
    }

    try {
      let designPlan = ''

      if (!isRefinement) {
        // -----------------------------------------------------------------------
        // PASS 0 — Plan (with ask_user tool for clarification)
        // -----------------------------------------------------------------------
        // sendEvent('text', { text: '**Planning the design…**\n\n' })

        const planMessages = await runAgentLoop({
          messages: [{ role: 'user', content: userMessage }],
          tools: [askUserTool],
          system: PLAN_SYSTEM,
          maxTokens: 2048 * 4,
          thinking: { budget_tokens: 1024 * 3 },
          ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
          onThinking: (delta) => sendEvent('text', { text: delta }),
          onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
          onUsage: async (usage, model) => {
            const mu = tokensToMicroUnits(usage, model)
            await checkAndDeductCredits(fastify.db, userId, mu)
            await logUsage(fastify.db, userId, 'build', model, usage, mu)
          },
        })
        designPlan = extractText(planMessages)

        // -----------------------------------------------------------------------
        // PASS 1 — Design System (creates styles.css)
        // -----------------------------------------------------------------------
        // sendEvent('text', { text: '\n\n---\n\n**Creating design system…**\n\n' })

        const shadcnPass1 = await createShadcnMcpTools()
        // try {
        //   await runAgentLoop({
        //     messages: [{ role: 'user', content: `Design plan:\n${designPlan}\n\nCreate the styles.css design system for this app.` }],
        //     tools: [...shadcnPass1.tools, writeFileTool],
        //     system: DESIGN_SYSTEM_PROMPT,
        //     maxTokens: 16000,
        //     thinking: { budget_tokens: 8000 },
        //     ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
        //     onThinking: (delta) => sendEvent('text', { text: delta }),
        //     onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
        //   })
        // } finally {
        //   await shadcnPass1.close()
        // }
      }

      const designSystemCSS = virtualFiles.get('styles.css') ?? ''

      // sendEvent('text', { text: isRefinement ? '**Updating the app…**\n\n' : '\n\n---\n\n**Building the app…**\n\n' })

      // -----------------------------------------------------------------------
      // PASS 2 — Build (extended thinking + cached system prompt)
      // -----------------------------------------------------------------------
      const buildUserMessage = isRefinement
        ? userMessage
        : (designPlan
          ? `Execute this plan and build the website:${designPlan}\n\n`
          : userMessage)

      let finalMessages: Anthropic.MessageParam[] = []
      const shadcnPass2 = await createShadcnMcpTools()
      try {
        finalMessages = await runAgentLoop({
          messages: [...messages.slice(0, -1), { role: 'user', content: buildUserMessage }],
          tools: [
            ...shadcnPass2.tools,
            {
              name: 'setup_database',
              description: 'Initialize the app database schema. Run CREATE TABLE IF NOT EXISTS statements and optional seed data. Call this once before writing any code that uses the db module.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  sql: { type: 'string', description: 'One or more SQL statements (CREATE TABLE, INSERT seed data, etc.)' },
                },
                required: ['sql'],
              },
              handler: async (input: Record<string, unknown>) => {
                const schemaSQL = input.sql as string
                // Persist schema in the draft version row
                await fastify.db
                  .insert(appVersions)
                  .values({ appId, versionNumber: targetVersionNumber, dbSchema: schemaSQL, isDraft: true })
                  .onConflictDoUpdate({
                    target: [appVersions.appId, appVersions.versionNumber],
                    set: { dbSchema: schemaSQL, isDraft: true },
                  })
                await fastify.db
                  .update(apps)
                  .set({ updatedAt: new Date() })
                  .where(eq(apps.id, appId))
                // Apply only to draft DB — never touch the published DB during build
                const draft = openDraftDb(appId)
                try { draft.exec(schemaSQL) } finally { draft.close() }
                return { success: true }
              },
            },
            {
              name: 'set_app_metadata',
              description: 'Set the display name and one-sentence description for the app.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['name', 'description'],
              },
              handler: async (input: Record<string, unknown>) => {
                agentState.name = input.name as string
                agentState.description = input.description as string
                await fastify.db
                  .update(apps)
                  .set({ name: agentState.name, description: agentState.description, updatedAt: new Date() })
                  .where(eq(apps.id, appId))
                return { success: true }
              },
            },
            writeFileTool,
            readFileTool,
            listFilesTool,
          ],
          system: BUILD_SYSTEM,
          maxTokens: 16000,
          thinking: { budget_tokens: 8000 },
          ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
          onThinking: (delta) => sendEvent('text', { text: delta }),
          onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
          onUsage: async (usage, model) => {
            const mu = tokensToMicroUnits(usage, model)
            await checkAndDeductCredits(fastify.db, userId, mu)
            await logUsage(fastify.db, userId, 'build', model, usage, mu)
          },
        })
      } finally {
        await shadcnPass2.close()
      }

      // Compile after build pass
      if (virtualFiles.size > 0) {
        const compileResult = await compileAndPersist()
        if ('error' in compileResult) {
          sendEvent('error', { message: `Compile error: ${compileResult.error}` })
        }
      }

      await fastify.db
        .update(apps)
        .set({ conversationHistory: stripCacheControl(finalMessages) as unknown[], updatedAt: new Date() })
        .where(eq(apps.id, appId))

      // // -----------------------------------------------------------------------
      // // PASS 3 — Polish (cached system prompt) — first build only
      // // -----------------------------------------------------------------------
      // if (!isRefinement && virtualFiles.size > 0) {
      //   // sendEvent('text', { text: '\n\n**Polishing the UI…**\n\n' })

      //   const filesSummary = [...virtualFiles.entries()]
      //     .map(([path, content]) => {
      //       const lang = path.endsWith('.css') ? 'css' : 'tsx'
      //       return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
      //     })
      //     .join('\n\n')

      //   await runAgentLoop({
      //     messages: [
      //       {
      //         role: 'user',
      //         content: [
      //           { type: 'text', text: `Design plan:\n${designPlan}\n\nOriginal request: "${userMessage}"\n\nCurrent files:\n${filesSummary}`, cache_control: { type: 'ephemeral' } },
      //           { type: 'text', text: 'Polish the UI — keep all functionality identical. Use CSS variables from styles.css throughout. Do NOT modify styles.css.' },
      //         ],
      //       },
      //     ],
      //     tools: [writeFileTool, readFileTool, listFilesTool],
      //     system: POLISH_SYSTEM,
      //     maxTokens: 16000,
      //     thinking: { budget_tokens: 8000 },
      //     ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
      //     onThinking: (delta) => sendEvent('text', { text: delta }),
      //     onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
      //   })

      //   // Compile after polish
      //   const polishCompileResult = await compileAndPersist()
      //   if ('error' in polishCompileResult) {
      //     sendEvent('error', { message: `Polish compile error: ${polishCompileResult.error}` })
      //   }
      // }

      // -----------------------------------------------------------------------
      // PASS 4 — Critic (no tools, cached system prompt, silent) — first build only
      // -----------------------------------------------------------------------
      // if (!isRefinement && virtualFiles.size > 0) {
      //   // sendEvent('text', { text: '\n\n**Quality check…**\n\n' })

      //   const filesSummary = [...virtualFiles.entries()]
      //     .map(([path, content]) => {
      //       const lang = path.endsWith('.css') ? 'css' : 'tsx'
      //       return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
      //     })
      //     .join('\n\n')

      //   const criticMessages = await runAgentLoop({
      //     messages: [{ role: 'user', content: [{ type: 'text', text: filesSummary, cache_control: { type: 'ephemeral' } }] }],
      //     system: CRITIC_SYSTEM,
      //     maxTokens: 4096,
      //     thinking: { budget_tokens: 2048 },
      //     ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
      //     onThinking: (delta) => sendEvent('text', { text: delta }),
      //   })

      //   const criticOutput = extractText(criticMessages).trim()

      //   // -----------------------------------------------------------------------
      //   // PASS 4 — Fix (only if critic found issues)
      //   // -----------------------------------------------------------------------
      //   if (criticOutput && criticOutput !== 'PASS') {
      //     // sendEvent('text', { text: '\n\n**Fixing identified issues…**\n\n' })

      //     const currentFilesSummary = [...virtualFiles.entries()]
      //       .map(([path, content]) => {
      //         const lang = path.endsWith('.css') ? 'css' : 'tsx'
      //         return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
      //       })
      //       .join('\n\n')

      //     await runAgentLoop({
      //       messages: [
      //         {
      //           role: 'user',
      //           content: [
      //             { type: 'text', text: `Current files:\n${currentFilesSummary}`, cache_control: { type: 'ephemeral' } },
      //             { type: 'text', text: `The following design issues were found:\n${criticOutput}\n\nFix only these specific issues in the relevant files. Keep everything else unchanged.` },
      //           ],
      //         },
      //       ],
      //       tools: [writeFileTool, readFileTool, listFilesTool],
      //       system: POLISH_SYSTEM,
      //       maxTokens: 16000,
      //       thinking: { budget_tokens: 8000 },
      //       ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
      //       onThinking: (delta) => sendEvent('text', { text: delta }),
      //       onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
      //     })

      //     const fixCompileResult = await compileAndPersist()
      //     if ('error' in fixCompileResult) {
      //       sendEvent('error', { message: `Fix compile error: ${fixCompileResult.error}` })
      //     }
      //   }
      // }

      const updated = await loadAppWithVersionNumber(fastify.db, appId, targetVersionNumber)
      sendEvent('widget', updated)
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        sendEvent('error', { code: 'insufficient_credits', message: 'Insufficient credits' })
      } else {
        fastify.log.error(err, 'app build error')
        sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    sendEvent('done', {})
    reply.raw.end()
  })
}

function queryAppDb(fastify: Fastify) {
  fastify.post<{
    Params: { appId: string }
    Querystring: { draft?: string }
    Body: { sql: string; params?: unknown[] }
  }>('/apps/:appId/db/query', {
    schema: {
      tags: ['apps'],
      summary: 'Run a SQL query against the app\'s SQLite database',
      querystring: {
        type: 'object',
        properties: { draft: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          sql: { type: 'string' },
          params: { type: 'array' },
        },
        required: ['sql'],
      },
    },
  }, async (request, reply) => {
    const { appId } = request.params
    const { sql, params = [] } = request.body
    const db = request.query.draft === 'true' ? openDraftDb(appId) : openDb(appId)
    try {
      const stmt = db.prepare(sql)
      const rows = stmt.reader ? stmt.all(...params) : (() => { stmt.run(...params); return [] })()
      return reply.send({ rows })
    } finally {
      db.close()
    }
  })
}

function answerAppQuestion(fastify: Fastify) {
  fastify.post<{ Body: { questionId: string; answer: string } }>('/apps/answer', {
    schema: {
      tags: ['apps'],
      summary: 'Submit a user answer to a pending ask_user question',
      body: {
        type: 'object',
        properties: {
          questionId: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['questionId', 'answer'],
      },
    },
  }, async (request, reply) => {
    const { questionId, answer } = request.body
    const resolve = pendingQuestions.get(questionId)
    if (!resolve) return reply.code(404).send({ error: 'Question not found or already answered' })
    pendingQuestions.delete(questionId)
    resolve(answer)
    return reply.send({ ok: true })
  })
}

export default appsPlugin
