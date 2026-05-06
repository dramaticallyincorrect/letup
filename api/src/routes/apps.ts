import {
  type FastifyPluginAsync,
} from 'fastify'
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { and, desc, eq, isNotNull, or } from 'drizzle-orm'
import { build } from 'esbuild'
import Anthropic from '@anthropic-ai/sdk'
import { apps, appVersions, userAppInstalls } from '../db/schema'
import { openDb, openDraftDb, copyPublishedToDraft, copyDraftToPublished } from '../db/appDb'
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
  listCreatedApps(fastify)
  createApp(fastify)
  createDraft(fastify)
  getApp(fastify)
  getAppForEdit(fastify)
  patchApp(fastify)
  installApp(fastify)
  uninstallApp(fastify)
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
    schema: { tags: ['apps'], summary: 'List apps installed by the current user' },
  }, async (_request, reply) => {
    const userId = getCurrentUserId()

    const result = await fastify.db
      .selectDistinct({
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
      .leftJoin(appVersions, eq(appVersions.appId, apps.id))
      .leftJoin(
        userAppInstalls,
        and(eq(userAppInstalls.versionId, appVersions.id), eq(userAppInstalls.userId, userId)),
      )
      .where(
        or(
          isNotNull(userAppInstalls.userId),
          and(eq(apps.creatorId, userId), eq(appVersions.isDraft, true)),
        ),
      )
      .orderBy(desc(apps.updatedAt))
    return reply.send(result)
  })
}

function listCreatedApps(fastify: Fastify) {
  fastify.get('/apps/created', {
    schema: { tags: ['apps'], summary: 'List apps created by the current user' },
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


function uninstallApp(fastify: Fastify) {
  fastify.delete<{ Params: { appId: string } }>('/apps/:appId', {
    schema: { tags: ['apps'], summary: 'Uninstall an app for the current user' },
  }, async (request, reply) => {
    const { appId } = request.params
    const userId = getCurrentUserId()

    const versionIds = await fastify.db
      .select({ versionId: appVersions.id })
      .from(appVersions)
      .where(eq(appVersions.appId, appId))

    for (const { versionId } of versionIds) {
      await fastify.db
        .delete(userAppInstalls)
        .where(and(eq(userAppInstalls.userId, userId), eq(userAppInstalls.versionId, versionId)))
    }

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

const esmShCache = new Map<string, string>()

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
      {
        name: 'esm-sh',
        setup(b) {
          // Resolve bare npm specifiers (not already external, not virtual files) to esm.sh
          b.onResolve({ filter: /^[^./]/ }, args => {
            if (args.namespace === 'virtual') return null
            return { path: `https://esm.sh/${args.path}`, namespace: 'esm-sh' }
          })
          // Resolve relative imports within esm.sh modules
          b.onResolve({ filter: /.*/, namespace: 'esm-sh' }, args => ({
            path: new URL(args.path, args.importer).toString(),
            namespace: 'esm-sh',
          }))
          // Fetch and cache module source from esm.sh
          b.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async args => {
            const cached = esmShCache.get(args.path)
            if (cached) return { contents: cached, loader: 'js' as const }
            const res = await fetch(args.path)
            if (!res.ok) throw new Error(`esm.sh fetch failed for ${args.path}: ${res.status}`)
            const contents = await res.text()
            esmShCache.set(args.path, contents)
            return { contents, loader: 'js' as const }
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
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional example answers to show the user as clickable suggestions',
          },
        },
        required: ['question'],
      },
      handler: async (input: Record<string, unknown>) => {
        const questionId = crypto.randomUUID()
        const answer = await new Promise<string>(resolve => {
          pendingQuestions.set(questionId, resolve)
          sendEvent('user_question', {
            questionId,
            question: input.question as string,
            suggestions: (input.suggestions as string[] | undefined) ?? [],
          })
        })
        return { answer }
      },
    }

    try {
      let planMessages: Anthropic.MessageParam[] = []

      if (!isRefinement) {

        planMessages = await runAgentLoop({
          messages: [{ role: 'user', content: userMessage }],
          tools: [askUserTool],
          system: PLAN_SYSTEM,
          maxTokens: 2048 * 4,
          thinking: { budget_tokens: 1024 * 3 },
          ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
          onThinking: (delta) => sendEvent('thinking', { text: delta }),
          onText: (delta) => sendEvent('text', { text: delta }),
          onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
          onUsage: async (usage, model) => {
            const mu = tokensToMicroUnits(usage, model)
            await checkAndDeductCredits(fastify.db, userId, mu)
            await logUsage(fastify.db, userId, 'build', model, usage, mu)
          },
        })

        console.log('plan messages are', planMessages)

      }

      const buildMessages: Anthropic.MessageParam[] = isRefinement
        ? messages
        : planMessages.length > 0
          ? [...markLastTurnCacheable(planMessages), { role: 'user', content: 'Now execute this plan and build the app.' }]
          : [{ role: 'user', content: userMessage }]

      let finalMessages: Anthropic.MessageParam[] = []
      const shadcnPass2 = await createShadcnMcpTools()
      try {
        const buildTools = [
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
          askUserTool
        ]

        const buildLoopParams = {
          tools: buildTools,
          system: BUILD_SYSTEM,
          maxTokens: 16000,
          thinking: { budget_tokens: 8000 },
          ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
          onThinking: (delta: string) => sendEvent('thinking', { text: delta }),
          onText: (delta: string) => sendEvent('text', { text: delta }),
          onToolCall: (name: string, input: unknown, result: unknown) => sendEvent('tool_call', { name, input, result }),
          onUsage: async (usage: Anthropic.Usage, model: string) => {
            const mu = tokensToMicroUnits(usage, model)
            await checkAndDeductCredits(fastify.db, userId, mu)
            await logUsage(fastify.db, userId, 'build', model, usage, mu)
          },
        }

        finalMessages = await runAgentLoop({
          messages: buildMessages,
          ...buildLoopParams,
        })

        const MAX_COMPILE_RETRIES = 2
        for (let attempt = 0; attempt <= MAX_COMPILE_RETRIES; attempt++) {
          if (virtualFiles.size === 0) break
          const compileResult = await compileAndPersist()
          if (!('error' in compileResult)) break
          if (attempt === MAX_COMPILE_RETRIES) {
            sendEvent('error', { message: `Compile error: ${compileResult.error}` })
            break
          }
          const retryMessages = markLastTurnCacheable(finalMessages)
          retryMessages.push({ role: 'user', content: `Compilation failed with this error:\n\n${compileResult.error}\n\nPlease fix the issue.` })
          finalMessages = await runAgentLoop({ messages: retryMessages, ...buildLoopParams })
        }
      } finally {
        await shadcnPass2.close()
      }

      // For new builds: save full plan messages (including thinking blocks) + build trigger + build turns.
      // Thinking blocks must be preserved so the API can replay them correctly in future refinements.
      // For refinements: finalMessages already has the correct structure.
      const historyToSave: Anthropic.MessageParam[] = isRefinement
        ? finalMessages
        : planMessages.length > 0
          ? [
            ...planMessages,
            { role: 'user' as const, content: 'Now execute this plan and build the app.' },
            ...finalMessages.slice(buildMessages.length),
          ]
          : [
            { role: 'user', content: userMessage },
            ...finalMessages.slice(buildMessages.length),
          ]
      await fastify.db
        .update(apps)
        .set({ conversationHistory: stripCacheControl(historyToSave) as unknown[], updatedAt: new Date() })
        .where(eq(apps.id, appId))

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
