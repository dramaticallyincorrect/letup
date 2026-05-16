import {
  type FastifyPluginAsync,
} from 'fastify'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, posix } from 'node:path'
import { compile } from '@tailwindcss/node'
import { and, desc, eq, isNotNull, max, or, sql } from 'drizzle-orm'
import { build } from 'esbuild'
import Anthropic from '@anthropic-ai/sdk'
import { apps, appVersions, userAppInstalls, aiUsageLogs } from '../db/schema'
import { openDb, openDraftDb, copyPublishedToDraft, copyDraftToPublished } from '../db/appDb'
import { runAgentLoop, cached, markLastTurnCacheable } from '../agent'
import { hasCredits, checkAndDeductCredits, logUsage, tokensToMicroUnits, InsufficientCreditsError } from '../credits'
import { Fastify } from '../fastify_type'
import { VirtualFS } from '../virtual-fs/virtual-fs'

// System prompts — loaded once, wrapped with cache_control for prompt caching
const PLAN_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-plan.md'), 'utf8'))
const BUILD_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-build.md'), 'utf8'))

// Deferred promises waiting for user answers, keyed by question ID
const pendingQuestions = new Map<string, (answer: string) => void>()

// Rewrite registry-internal import paths to the virtual filesystem paths used at runtime.
// The registry ships raw source where inter-component imports use @/registry/new-york-v4/…
// but the shadcn CLI normally rewrites these on install. We do the same here.
function rewriteRegistryImports(content: string): string {
  return content
    .replace(/@\/registry\/new-york-v4\/ui\//g, '@/components/ui/')
    .replace(/@\/registry\/new-york-v4\/lib\//g, '@/lib/')
    .replace(/@\/registry\/new-york-v4\/hooks\//g, '@/hooks/')
}

// Default shadcn components pre-loaded into every new virtual filesystem.
// Fetched from the public registry once at startup and cached for the process lifetime.
const SCAFFOLD_COMPONENTS = [
  'utils',
  'accordion', 'alert', 'alert-dialog', 'aspect-ratio', 'avatar',
  'badge', 'breadcrumb', 'button',
  'calendar', 'card', 'carousel', 'chart', 'checkbox', 'collapsible', 'command', 'context-menu',
  'dialog', 'drawer', 'dropdown-menu',
  'form',
  'hover-card',
  'input', 'input-otp',
  'label',
  'menubar',
  'navigation-menu',
  'pagination', 'popover', 'progress',
  'radio-group', 'resizable',
  'scroll-area', 'select', 'separator', 'sheet', 'sidebar', 'skeleton', 'slider', 'sonner', 'switch',
  'table', 'tabs', 'textarea', 'toggle', 'toggle-group', 'tooltip',
]

let scaffoldCache: Promise<Map<string, string>> | null = null

function loadScaffoldFiles(): Promise<Map<string, string>> {
  if (!scaffoldCache) {
    scaffoldCache = (async () => {
      const files = new Map<string, string>()
      await Promise.all(SCAFFOLD_COMPONENTS.map(async (name) => {
        try {
          const res = await fetch(`https://ui.shadcn.com/r/styles/new-york-v4/${name}.json`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json() as { files?: Array<{ path?: string; type?: string; content: string }> }
          for (const file of data.files ?? []) {
            const basename = (file.path ?? `${name}.tsx`).split('/').pop()!
            const folder = file.type === 'registry:lib' ? 'lib' : 'components/ui'
            files.set(`${folder}/${basename}`, rewriteRegistryImports(file.content))
          }
        } catch (err) {
          console.warn(`[scaffold] failed to load shadcn component "${name}":`, err)
        }
      }))
      console.log(`[scaffold] loaded ${files.size} default component files`)
      files.set('index.tsx', '')
      files.set('styles.css', '')
      return files
    })()
  }
  return scaffoldCache
}

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
  deleteDraftApp(fastify)
  buildApp(fastify)
  answerAppQuestion(fastify)
  queryAppDb(fastify)
  appManifest(fastify)
  getAppUsage(fastify)
}

function sseHeaders(origin?: string) {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function listApps(fastify: Fastify) {
  fastify.get('/apps', {
    schema: { tags: ['apps'], summary: 'List apps installed by the current user' },
  }, async (request, reply) => {
    const userId = request.assertAuthenticated()

    const result = await fastify.db
      .selectDistinct({
        id: apps.id,
        creatorId: apps.creatorId,
        name: apps.name,
        description: apps.description,
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
  }, async (request, reply) => {
    const userId = request.assertAuthenticated()
    const maxVersionSq = fastify.db
      .select({ appId: appVersions.appId, maxVersion: max(appVersions.versionNumber).as('max_version') })
      .from(appVersions)
      .groupBy(appVersions.appId)
      .as('max_version_sq')

    const latestVersionAlias = appVersions
    const result = await fastify.db
      .select({
        id: apps.id,
        creatorId: apps.creatorId,
        name: apps.name,
        description: apps.description,
        latestVersionNumber: apps.latestVersionNumber,
        isDraft: latestVersionAlias.isDraft,
        createdAt: apps.createdAt,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .leftJoin(maxVersionSq, eq(maxVersionSq.appId, apps.id))
      .leftJoin(latestVersionAlias, and(
        eq(latestVersionAlias.appId, apps.id),
        eq(latestVersionAlias.versionNumber, maxVersionSq.maxVersion),
      ))
      .where(eq(apps.creatorId, userId))
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
      .values({ name: request.body.name, creatorId: request.assertAuthenticated() })
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
    const [row] = await fastify.db
      .select(APP_VERSION_COLUMNS)
      .from(apps)
      .leftJoin(
        appVersions,
        and(
          eq(appVersions.appId, apps.id),
          eq(appVersions.versionNumber, apps.latestVersionNumber),
        ),
      )
      .where(eq(apps.id, request.params.appId))

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
    const userId = request.assertAuthenticated()


    const [app] = await fastify.db
      .select({ creatorId: apps.creatorId })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)

    if (app?.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

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
      .set({ latestVersionNumber: draftVersion.versionNumber, updatedAt: new Date() })
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
    const userId = request.assertAuthenticated()

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

function deleteDraftApp(fastify: Fastify) {
  fastify.delete<{ Params: { appId: string } }>('/apps/:appId/draft', {
    schema: { tags: ['apps'], summary: 'Permanently delete a draft app created by the current user' },
  }, async (request, reply) => {
    const { appId } = request.params
    const userId = request.assertAuthenticated()

    const [app] = await fastify.db
      .select({ id: apps.id, latestVersionNumber: apps.latestVersionNumber, creatorId: apps.creatorId })
      .from(apps)
      .where(eq(apps.id, appId))

    if (!app) return reply.code(404).send({ error: 'App not found' })
    if (app.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

    await fastify.db.delete(appVersions).where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))

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

function extractTailwindCandidates(files: Map<string, string>): string[] {
  const candidates = new Set<string>()
  for (const [path, content] of files) {
    if (!/\.(tsx?|jsx?)$/.test(path)) continue
    for (const token of content.split(/[\s"'`{};,<>=+&|^~!()[\]]+/)) {
      if (token.length > 1 && token.length < 100) candidates.add(token)
    }
  }
  return [...candidates]
}

async function compileTailwindCss(files: Map<string, string>): Promise<string> {
  const userCss = files.get('styles.css') ?? ''
  const cssInput = `@import "tailwindcss";\n${userCss}`
  const compiler = await compile(cssInput, {
    base: join(__dirname, '../../..'),
    onDependency: () => { },
  })
  return compiler.build(extractTailwindCandidates(files))
}

const esmShCache = new Map<string, string>()

async function compileVirtualFiles(files: Map<string, string>): Promise<string> {
  const result = await build({
    entryPoints: ['index.tsx'],
    bundle: true,
    format: 'cjs',
    write: false,
    jsx: 'automatic',
    target: 'es2020',
    external: [
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'framer-motion',
      'radix-ui', 'lucide-react',
      'class-variance-authority', 'tailwind-merge',
      'ai', 'db',
    ],
    plugins: [
      {
        name: 'virtual-fs',
        setup(b) {
          // All modules provided by the req shim at runtime must be marked external
          // before the esm-sh plugin intercepts them. If esbuild bundles any of these
          // from esm.sh it wraps them in __commonJS, bypassing the req shim entirely.
          // React bundled from esm.sh has a different ReactCurrentDispatcher than the
          // host React, causing hook calls to fail with "Cannot read properties of null".
          b.onResolve({ filter: /^(react|react\/jsx-runtime|react-dom|framer-motion|radix-ui|lucide-react|class-variance-authority|tailwind-merge|db|ai|router)$/ }, () => ({ external: true }))
          b.onResolve({ filter: /^@\// }, args => {
            const relativePath = args.path.slice(2) // '@/lib/utils' → 'lib/utils'
            const resolved = resolveVirtualPath('', relativePath, files)
            if (resolved) return { path: resolved, namespace: 'virtual' }
            return { external: true }
          })
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
            // CSS is extracted separately (virtualFiles → cssCode); return empty JS so
            // `import './styles.css'` compiles cleanly without bundling CSS into the JS output.
            if (args.path.endsWith('.css')) return { contents: '', loader: 'js' as const }
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
          // Resolve bare npm specifiers to esm.sh.
          // Exclude paths that look like local source files (.ts, .tsx, .css) — these are
          // virtual files that aren't written yet (e.g. during progressive compilation) and
          // should never be fetched from esm.sh.
          b.onResolve({ filter: /^[^./]/ }, args => {
            if (/\.(tsx?|css|json)$/.test(args.path)) return null
            return { path: `https://esm.sh/${args.path}`, namespace: 'esm-sh' }
          })
          // Resolve relative imports within esm.sh modules.
          // Redirect React imports to the external host React so esm.sh packages
          // don't bundle a second React instance with a different dispatcher.
          b.onResolve({ filter: /.*/, namespace: 'esm-sh' }, args => {
            const resolved = new URL(args.path, args.importer).toString()
            if (/esm\.sh\/(react)(@|\?|\/|$)/.test(resolved)) {
              if (/jsx-runtime|jsx-dev-runtime/.test(resolved)) {
                return { path: 'react/jsx-runtime', external: true }
              }
              return { path: 'react', external: true }
            }
            if (/esm\.sh\/(react-dom)(@|\?|\/|$)/.test(resolved)) {
              if (/\/client/.test(resolved)) {
                return { path: 'react-dom/client', external: true }
              }
              return { path: 'react-dom', external: true }
            }
            return { path: resolved, namespace: 'esm-sh' }
          })
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
// Strip old cache_control from all messages then mark only the last turn.
// Prevents accumulating more than 1 message-level cache block across chained loops
// (Anthropic API allows at most 4 total across system + tools + messages).
function freshCacheable(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return markLastTurnCacheable(stripCacheControl(messages))
}

function extractText(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
  }
  return ''
}

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
        eq(appVersions.isDraft, true),
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
    const userId = request.assertAuthenticated()

    const app = await loadAppWithVersion(fastify.db, appId)
    if (!app) return reply.code(404).send({ error: 'app not found' })

    // Draft must already exist (created via POST /apps or POST /apps/:appId/draft)
    const [draftRow] = await fastify.db
      .select({ id: appVersions.id, versionNumber: appVersions.versionNumber, sourceFiles: appVersions.sourceFiles, compiledCode: appVersions.compiledCode })
      .from(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
      .limit(1)
    if (!draftRow) return reply.code(400).send({ error: 'No draft version found — call POST /apps/:appId/draft first' })

    if (!(await hasCredits(fastify.db, userId))) {
      return reply.code(402).send({ error: 'Insufficient credits' })
    }

    const targetVersionNumber = draftRow.versionNumber
    const draftVersionId = draftRow.id
    const buildSessionId = randomUUID()

    const ac = new AbortController()
    const sessionQuestionIds = new Set<string>()

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    request.raw.on('close', () => {
      if (!ac.signal.aborted) ac.abort()
    })

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let lowCreditsEmitted = false

    const appFs = await getAppFs(fastify, appId)


    const history = (Array.isArray(app.conversationHistory) ? app.conversationHistory : []) as Anthropic.MessageParam[]
    const isRefinement = history.length > 0
    // Cache the prior conversation so re-sent history is not re-billed on refinement.
    const cachedHistory = isRefinement ? markLastTurnCacheable(history) : history
    const messages: Anthropic.MessageParam[] = [...cachedHistory, { role: 'user', content: userMessage }]

    async function compileAndPersist(): Promise<{ success: true } | { error: string }> {
      let cssCode: string | null
      try {
        cssCode = await compileTailwindCss(appFs.files)
      } catch (err) {
        console.warn('[css] Tailwind compilation failed, falling back to raw styles.css:', err)
        cssCode = appFs.files.get('styles.css') ?? null
      }
      const sourceFilesArray = [...appFs.files.entries()].map(([path, content]) => ({ path, content }))
      try {
        const compiled = await compileVirtualFiles(appFs.files)
        await fastify.db
          .insert(appVersions)
          .values({ appId, versionNumber: targetVersionNumber, compiledCode: compiled, cssCode, sourceFiles: sourceFilesArray, isDraft: true })
          .onConflictDoUpdate({
            target: [appVersions.appId, appVersions.versionNumber],
            set: { compiledCode: compiled, cssCode, sourceFiles: sourceFilesArray, isDraft: true },
          })
        return { success: true }
      } catch (err) {
        // Compilation failed — still persist source files so "continue" can pick them up
        await fastify.db
          .insert(appVersions)
          .values({ appId, versionNumber: targetVersionNumber, cssCode, sourceFiles: sourceFilesArray, isDraft: true, compiledCode: null })
          .onConflictDoUpdate({
            target: [appVersions.appId, appVersions.versionNumber],
            set: { cssCode, sourceFiles: sourceFilesArray, isDraft: true },
          })
        return { error: err instanceof Error ? err.message : 'Compile failed' }
      }
    }

    // Debounce handle for progressive compilation during parallel builds
    let progressiveCompileTimer: ReturnType<typeof setTimeout> | null = null

    // Attempt a non-blocking compile and emit a partial widget event if successful.
    // Called after every file write so the preview appears as soon as enough files exist.
    function scheduleProgressiveCompile() {
      if (progressiveCompileTimer) clearTimeout(progressiveCompileTimer)
      progressiveCompileTimer = setTimeout(async () => {
        try {
          const result = await compileAndPersist()
          if (!('error' in result)) {
            const updated = await loadAppWithVersionNumber(fastify.db, appId, targetVersionNumber)
            sendEvent('widget', updated)
          }
        } catch { /* ignore — authoritative compile runs at end */ }
      }, 500)
    }

    const askUserTool = {
      name: 'ask_user',
      description: 'ask the user a question either for clarification or information needed to complete the task',
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
        sessionQuestionIds.add(questionId)
        const answer = await new Promise<string>((resolve, reject) => {
          pendingQuestions.set(questionId, resolve)
          const onAbort = () => {
            pendingQuestions.delete(questionId)
            reject(ac.signal.reason ?? new DOMException('Aborted', 'AbortError'))
          }
          if (ac.signal.aborted) return onAbort()
          ac.signal.addEventListener('abort', onAbort, { once: true })
          sendEvent('user_question', {
            questionId,
            question: input.question as string,
            suggestions: (input.suggestions as string[] | undefined) ?? [],
          })
        })
        return { answer }
      },
    }

    async function saveProgress(msgs: Anthropic.MessageParam[]) {
      await fastify.db
        .update(apps)
        .set({ conversationHistory: stripCacheControl(msgs) as unknown[], updatedAt: new Date() })
        .where(eq(apps.id, appId))
    }

    let buildMessages: Anthropic.MessageParam[] = messages

    try {

      const sharedAgentParams = {
        ...(modelOverride ? { model: modelOverride as Parameters<typeof runAgentLoop>[0]['model'] } : {}),
        signal: ac.signal,
        onThinking: (delta: string) => sendEvent('thinking', { text: delta }),
        onText: (delta: string) => sendEvent('text', { text: delta }),
        onToolCall: (name: string, input: unknown, result: unknown) => {
          if (name! in [
            askUserTool.name,
            appFs.readFileRangeTool.name,
            appFs.grepFileTool.name,
            appFs.searchFilesTool.name,
            appFs.listFilesTool.name,
            appFs.readFileTool.name,
          ]) {
            scheduleProgressiveCompile()
          }
          sendEvent('tool_call', { name, input, result })
        },
        onUsage: async (usage: Anthropic.Usage, model: string, durationSeconds: number) => {
          const mu = tokensToMicroUnits(usage, model)
          const newBalance = await checkAndDeductCredits(fastify.db, userId, mu)
          await logUsage(fastify.db, userId, 'build', model, usage, mu, draftVersionId, userMessage, buildSessionId, durationSeconds)
          if (!lowCreditsEmitted) {
            const credits = Math.floor(Number(newBalance) / 12_500_000)
            if (credits <= 5) {
              lowCreditsEmitted = true
              sendEvent('low_credits', { credits })
            }
          }
        },
      }

      const setupDatabaseTool = {
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
          await fastify.db.update(apps).set({ updatedAt: new Date() }).where(eq(apps.id, appId))
          const draft = openDraftDb(appId)
          try { draft.exec(schemaSQL) } finally { draft.close() }
          return { success: true }
        },
      }


      let allMessages: Anthropic.MessageParam[] = []

      // --- Build phase ---
      const buildTools = [
        askUserTool,
        setupDatabaseTool,
        appFs.strReplaceTool,
        appFs.appendTextTool,
        appFs.readFileTool,
        appFs.readFileRangeTool,
        appFs.grepFileTool,
        appFs.searchFilesTool,
        appFs.listFilesTool,
      ]


      // --- Planning phase (fresh builds only) ---
      if (!isRefinement) {
        const planResult = await runAgentLoop({
          effort: 'medium',
          messages: [{ role: 'user', content: userMessage }],
          tools: [
            askUserTool,
            appFs.strReplaceTool,
            appFs.appendTextTool,
            appFs.readFileTool,
            appFs.readFileRangeTool,
            appFs.grepFileTool,
            appFs.searchFilesTool,
            appFs.listFilesTool,
          ],
          system: PLAN_SYSTEM,
          ...sharedAgentParams,
        })
        const lastPlanMsg = planResult.findLast(m => m.role === 'assistant')
        const planText = lastPlanMsg ? extractText(lastPlanMsg.content) : ''
        if (planText) {
          buildMessages = [{ role: 'user', content: `${userMessage}\n\n---\n## Design Plan\n\n${planText}` }]
        }
        await saveProgress(buildMessages)
      }


      const buildLoopParams = {
        tools: buildTools,
        system: BUILD_SYSTEM,
        maxTokens: 20000,
        ...sharedAgentParams,
      }

      async function runBuildWithRetry(msgs: Anthropic.MessageParam[]): Promise<Anthropic.MessageParam[]> {
        let result = await runAgentLoop({ messages: msgs, ...buildLoopParams, effort: 'medium' })
        const MAX_COMPILE_RETRIES = 2
        for (let attempt = 0; attempt <= MAX_COMPILE_RETRIES; attempt++) {
          if (appFs.files.size === 0) break
          if (progressiveCompileTimer) {
            clearTimeout(progressiveCompileTimer)
            progressiveCompileTimer = null
          }
          const compileResult = await compileAndPersist()
          if (!('error' in compileResult)) break
          if (attempt === MAX_COMPILE_RETRIES) {
            sendEvent('error', { message: `Compile error: ${compileResult.error}` })
            break
          }
          const retryMsgs = freshCacheable(result)
          retryMsgs.push({ role: 'user', content: `Compilation failed:\n\n${compileResult.error}\n\nPlease fix the issue.` })
          console.log(`Compile failed (attempt ${attempt + 1}/${MAX_COMPILE_RETRIES}), retrying agent loop with updated messages...`)
          result = await runAgentLoop({ messages: retryMsgs, ...buildLoopParams, effort: 'medium' })
        }
        return result
      }

      allMessages = await runBuildWithRetry(buildMessages)

      await saveProgress(allMessages)

      if (appFs.files.size > 0) {
        const updated = await loadAppWithVersionNumber(fastify.db, appId, targetVersionNumber)
        sendEvent('widget', updated)
      }
    } catch (err) {
      const isAbort = ac.signal.aborted || (err instanceof Error && err.name === 'AbortError')
      if (isAbort) {
        for (const qid of sessionQuestionIds) pendingQuestions.delete(qid)
        try { await saveProgress(buildMessages) } catch (e) { fastify.log.warn(e, 'failed to save progress on cancel') }
        if (!request.raw.writableEnded) sendEvent('cancelled', {})
        fastify.log.info({ appId, buildSessionId }, 'app build cancelled by client')
      } else if (err instanceof InsufficientCreditsError) {
        sendEvent('error', { code: 'insufficient_credits', message: 'Insufficient credits' })
      } else {
        fastify.log.error(err, 'app build error')
        sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    if (!request.raw.writableEnded) {
      sendEvent('done', {})
      reply.raw.end()
    }
  })
}

async function getAppFs(fastify: Fastify, appId: string): Promise<VirtualFS> {
  const app = await loadAppWithVersion(fastify.db, appId)

  const [draftRow] = await fastify.db
    .select({ id: appVersions.id, versionNumber: appVersions.versionNumber, sourceFiles: appVersions.sourceFiles, compiledCode: appVersions.compiledCode })
    .from(appVersions)
    .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
    .limit(1)
  const virtualFiles = new Map<string, string>()

  // Seed default shadcn scaffold components first so the agent can use them without
  // calling install_shadcn_component. Existing source files loaded below take priority.
  for (const [path, content] of await loadScaffoldFiles()) {
    virtualFiles.set(path, content)
  }

  // Seed with existing source files from the draft version (which always has the latest
  // files regardless of whether latestVersionNumber has been updated yet).
  const seedFiles = Array.isArray(draftRow.sourceFiles) && draftRow.sourceFiles.length > 0
    ? draftRow.sourceFiles
    : app.sourceFiles
  if (Array.isArray(seedFiles)) {
    for (const f of seedFiles as Array<{ path: string; content: string }>) {
      virtualFiles.set(f.path, f.content)
    }
  }

  return new VirtualFS(virtualFiles)
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

function getAppUsage(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId/usage', {
    schema: {
      tags: ['apps'],
      summary: 'Get per-version token usage for an app',
    },
  }, async (request, reply) => {
    const { appId } = request.params
    const userId = request.assertAuthenticated()

    const app = await fastify.db
      .select({ creatorId: apps.creatorId })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)
    if (!app[0]) return reply.code(404).send({ error: 'App not found' })
    if (app[0].creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

    const rows = await fastify.db
      .select({
        appVersionId: aiUsageLogs.appVersionId,
        versionNumber: appVersions.versionNumber,
        isDraft: appVersions.isDraft,
        buildSessionId: aiUsageLogs.buildSessionId,
        userMessage: aiUsageLogs.userMessage,
        model: aiUsageLogs.model,
        inputTokens: sql<number>`sum(${aiUsageLogs.inputTokens})::int`,
        outputTokens: sql<number>`sum(${aiUsageLogs.outputTokens})::int`,
        cacheCreationTokens: sql<number>`sum(${aiUsageLogs.cacheCreationTokens})::int`,
        cacheReadTokens: sql<number>`sum(${aiUsageLogs.cacheReadTokens})::int`,
        microUnitsUsed: sql<string>`sum(${aiUsageLogs.microUnitsUsed})::text`,
        durationSeconds: sql<number>`sum(${aiUsageLogs.durationSeconds})::real`,
        createdAt: sql<string>`min(${aiUsageLogs.createdAt})::text`,
      })
      .from(aiUsageLogs)
      .innerJoin(appVersions, eq(aiUsageLogs.appVersionId, appVersions.id))
      .where(and(
        eq(appVersions.appId, appId),
        isNotNull(aiUsageLogs.buildSessionId),
      ))
      .groupBy(
        aiUsageLogs.appVersionId,
        appVersions.versionNumber,
        appVersions.isDraft,
        aiUsageLogs.buildSessionId,
        aiUsageLogs.userMessage,
        aiUsageLogs.model,
      )
      .orderBy(appVersions.versionNumber, sql`min(${aiUsageLogs.createdAt})`)

    // Group by version
    const versionMap = new Map<string, {
      appVersionId: string
      versionNumber: number
      isDraft: boolean
      builds: Array<{
        buildSessionId: string
        userMessage: string | null
        model: string
        inputTokens: number
        outputTokens: number
        cacheCreationTokens: number
        cacheReadTokens: number
        microUnitsUsed: string
        durationSeconds: number | null
        createdAt: string
      }>
      totalInputTokens: number
      totalOutputTokens: number
      totalCacheCreationTokens: number
      totalCacheReadTokens: number
      totalMicroUnitsUsed: bigint
    }>()

    for (const row of rows) {
      const vId = row.appVersionId!
      if (!versionMap.has(vId)) {
        versionMap.set(vId, {
          appVersionId: vId,
          versionNumber: row.versionNumber,
          isDraft: row.isDraft,
          builds: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreationTokens: 0,
          totalCacheReadTokens: 0,
          totalMicroUnitsUsed: 0n,
        })
      }
      const v = versionMap.get(vId)!
      v.builds.push({
        buildSessionId: row.buildSessionId!,
        userMessage: row.userMessage,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        cacheReadTokens: row.cacheReadTokens,
        microUnitsUsed: row.microUnitsUsed,
        durationSeconds: row.durationSeconds,
        createdAt: row.createdAt,
      })
      v.totalInputTokens += row.inputTokens
      v.totalOutputTokens += row.outputTokens
      v.totalCacheCreationTokens += row.cacheCreationTokens
      v.totalCacheReadTokens += row.cacheReadTokens
      v.totalMicroUnitsUsed += BigInt(row.microUnitsUsed)
    }

    const result = Array.from(versionMap.values()).map(v => ({
      ...v,
      totalMicroUnitsUsed: v.totalMicroUnitsUsed.toString(),
    }))

    return reply.send(result)
  })
}

export default appsPlugin
