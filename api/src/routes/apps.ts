import {
  type FastifyPluginAsync,
} from 'fastify'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, posix } from 'node:path'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { and, countDistinct, desc, eq, isNotNull, max, or, sql } from 'drizzle-orm'
import { build } from 'esbuild'
import Anthropic from '@anthropic-ai/sdk'
import { apps, appVersions, userAppInstalls, aiUsageLogs, userSubscriptions } from '../db/schema'
import { openDraftDb, openUserDb, copyDraftToUserDb, copyUserDbToDraft } from '../db/appDb'
import { runAgentLoop, cached, markLastTurnCacheable, PauseForQuestionError } from '../agent'
import { hasCredits, checkAndDeductCredits, logUsage, tokensToMicroUnits, microUnitsToCredits, InsufficientCreditsError } from '../credits'
import { Fastify } from '../fastify_type'
import { VirtualFS } from '../virtual-fs/virtual-fs'

type DisplayMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'question'; questionId: string; question: string; suggestions: string[]; answer?: string; buildPhase?: 'planning1' | 'planning2' | 'build' }

function lastAssistantText(msgs: Anthropic.MessageParam[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role === 'assistant') {
      if (typeof m.content === 'string') return m.content
      if (Array.isArray(m.content)) {
        return (m.content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === 'text')
          .map(b => b.text ?? '')
          .join('')
      }
    }
  }
  return ''
}


// System prompts — loaded once, wrapped with cache_control for prompt caching
const PRODUCT_PLAN_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-product-plan.md'), 'utf8'))
const PLAN_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-plan.md'), 'utf8'))
const BUILD_SYSTEM = cached(readFileSync(join(__dirname, '../prompts/app-build.md'), 'utf8'))

// Deferred promises waiting for frontend runtime verification results, keyed by check ID
const pendingRuntimeChecks = new Map<string, (result: { ok: boolean; error?: string }) => void>()

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

const BASE_STYLES_CSS = `@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(1 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(1 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(1 0 0);
  --primary: oklch(1 0 0);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(1 0 0);
  --secondary-foreground: oklch(1 0 0);
  --muted: oklch(1 0 0);
  --muted-foreground: oklch(1 0 0);
  --accent: oklch(1 0 0);
  --accent-foreground: oklch(1 0 0);
  --destructive: oklch(1 0 0);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(1 0 0);
  --input: oklch(1 0 0);
  --ring: oklch(1 0 0);
  --chart-1: oklch(1 0 0);
  --chart-2: oklch(1 0 0);
  --chart-3: oklch(1 0 0);
  --chart-4: oklch(1 0 0);
  --chart-5: oklch(1 0 0);
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(1 0 0);
  --sidebar-primary: oklch(1 0 0);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(1 0 0);
  --sidebar-accent-foreground: oklch(1 0 0);
  --sidebar-border: oklch(1 0 0);
  --sidebar-ring: oklch(1 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(1 0 0);
  --foreground: oklch(1 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(1 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(1 0 0);
  --primary: oklch(1 0 0);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(1 0 0);
  --secondary-foreground: oklch(1 0 0);
  --muted: oklch(1 0 0);
  --muted-foreground: oklch(1 0 0);
  --accent: oklch(1 0 0);
  --accent-foreground: oklch(1 0 0);
  --destructive: oklch(1 0 0);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(1 0 0);
  --input: oklch(1 0 0);
  --ring: oklch(1 0 0);
  --chart-1: oklch(1 0 0);
  --chart-2: oklch(1 0 0);
  --chart-3: oklch(1 0 0);
  --chart-4: oklch(1 0 0);
  --chart-5: oklch(1 0 0);
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(1 0 0);
  --sidebar-primary: oklch(1 0 0);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(1 0 0);
  --sidebar-accent-foreground: oklch(1 0 0);
  --sidebar-border: oklch(1 0 0);
  --sidebar-ring: oklch(1 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}
`

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
      files.set('index.tsx',
        `
import React from 'react';
// Standard shadcn/radix primivites available in /components/ui, do not try to read them unless there is a specific reason"
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function App() {
  return <div className="app-shell">Content coming...</div>;
}`.trim())
      files.set('styles.css', BASE_STYLES_CSS)
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
  runtimeResult(fastify)
  queryAppDb(fastify)
  appManifest(fastify)
  renderApp(fastify)
  getAppUsage(fastify)
  adminListApps(fastify)
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
          "id": `${process.env.FRONTEND_URL}/apps/${app.id}/`,
          "name": app.name,
          "short_name": `SubSite ${app.id}`,
          "scope": `${process.env.FRONTEND_URL}/apps/${appId}/`,
          "start_url": `${process.env.FRONTEND_URL}/apps/${app.id}/`,
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

    const userId = request.assertAuthenticated()
    openDraftDb(app.id, userId).close()
    return reply.code(201).send(app)
  })
}

function createDraft(fastify: Fastify) {
  fastify.post<{ Params: { appId: string } }>('/apps/:appId/draft', {
    schema: { tags: ['apps'], summary: 'Create a new draft version from the current published version' },
  }, async (request, reply) => {
    const { appId } = request.params
    const userId = request.assertAuthenticated()

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

    copyUserDbToDraft(appId, userId)

    return reply.code(201).send(draftVersion)
  })
}

function getApp(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId', {
    schema: { tags: ['apps'], summary: 'Get an app by ID' },
  }, async (request, reply) => {
    request.assertAuthenticated()
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderAppShell(opts: {
  appId: string
  name: string | null
  cssCode: string | null
  draft: boolean
}): string {
  const title = escapeHtml(opts.name ?? 'App')
  const css = opts.cssCode ?? ''
  const context = JSON.stringify({ appId: opts.appId, draft: opts.draft })
  const bundleSrc = `/apps/${opts.appId}/bundle.js${opts.draft ? '?draft=true' : ''}`
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <base href="/apps/${opts.appId}/render/">
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__APP_CONTEXT__ = ${context};
      window.addEventListener('error', function(e){
        try { parent.postMessage({ type: 'app-error', message: e.message, stack: e.error && e.error.stack }, '*'); } catch(_) {}
      });
      window.addEventListener('unhandledrejection', function(e){
        try { parent.postMessage({ type: 'app-error', message: String(e.reason && e.reason.message || e.reason) }, '*'); } catch(_) {}
      });
      // Intercept fetch responses to report HTTP errors from db/ai endpoints or
      // external APIs, but suppress failures from other platform endpoints.
      (function(){
        var _fetch = window.fetch;
        window.fetch = function(input) {
          var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
          return _fetch.apply(this, arguments).then(function(res) {
            if (!res.ok) {
              var isDbOrAi = /\\/apps\\/[^\\/]+\\/db\\/query|\\/ai\\/generate/.test(url);
              var isExternal = url.indexOf('/') !== 0 && url.indexOf('http') === 0;
              if (isDbOrAi || isExternal) {
                try { parent.postMessage({ type: 'app-error', message: 'HTTP ' + res.status + ': ' + url }, '*'); } catch(_) {}
              }
            }
            return res;
          });
        };
      })();
    </script>
    <script type="module" src="${bundleSrc}"></script>
  </body>
</html>`
}

function renderApp(fastify: Fastify) {
  type RenderParams = { Params: { appId: string }; Querystring: { draft?: string } }

  // Serve the compiled JS bundle — separate from the HTML shell so the browser can
  // cache it and so we never need to escape JS source inside an HTML document.
  fastify.get<RenderParams>(
    '/apps/:appId/bundle.js',
    { schema: { tags: ['apps'], summary: 'Serve the compiled JS bundle for an app version' } },
    async (request, reply) => {
      request.assertAuthenticated()
      const { appId } = request.params
      const draft = request.query.draft === 'true'

      const [appRow] = await fastify.db
        .select({ latestVersionNumber: apps.latestVersionNumber })
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1)
      if (!appRow) return reply.code(404).type('text/plain').send('app not found')

      let compiledCode: string | null = null
      if (draft) {
        const [row] = await fastify.db
          .select({ compiledCode: appVersions.compiledCode })
          .from(appVersions)
          .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
          .limit(1)
        compiledCode = row?.compiledCode ?? null
      } else {
        const [row] = await fastify.db
          .select({ compiledCode: appVersions.compiledCode })
          .from(appVersions)
          .where(and(eq(appVersions.appId, appId), eq(appVersions.versionNumber, appRow.latestVersionNumber)))
          .limit(1)
        compiledCode = row?.compiledCode ?? null
      }

      if (!compiledCode) return reply.code(404).type('text/plain').send('app not built yet')

      return reply
        .type('application/javascript; charset=utf-8')
        .header('Cache-Control', 'no-store')
        .send(compiledCode)
    },
  )

  // HTML shell — thin document that injects context and loads the bundle via <script src>.
  const shellHandler = async (
    request: import('fastify').FastifyRequest<RenderParams>,
    reply: import('fastify').FastifyReply,
  ) => {
    request.assertAuthenticated()
    const { appId } = request.params
    const draft = request.query.draft === 'true'

    const [appRow] = await fastify.db
      .select({ name: apps.name, latestVersionNumber: apps.latestVersionNumber })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)
    if (!appRow) return reply.code(404).type('text/plain').send('app not found')

    let cssCode: string | null = null
    if (draft) {
      const [row] = await fastify.db
        .select({ cssCode: appVersions.cssCode })
        .from(appVersions)
        .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
        .limit(1)
      cssCode = row?.cssCode ?? null
    } else {
      const [row] = await fastify.db
        .select({ cssCode: appVersions.cssCode })
        .from(appVersions)
        .where(and(eq(appVersions.appId, appId), eq(appVersions.versionNumber, appRow.latestVersionNumber)))
        .limit(1)
      cssCode = row?.cssCode ?? null
    }

    const html = renderAppShell({ appId, name: appRow.name, cssCode, draft })

    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(html)
  }

  fastify.get<RenderParams>(
    '/apps/:appId/render',
    { schema: { tags: ['apps'], summary: 'Render the app HTML shell for iframe embedding' } },
    shellHandler,
  )
  // Splat route — apps using pushState (e.g. /apps/abc/render/settings) survive hard refresh.
  fastify.get<{ Params: { appId: string; '*': string }; Querystring: { draft?: string } }>(
    '/apps/:appId/render/*',
    { schema: { tags: ['apps'], summary: 'Render the app HTML shell (any sub-path)' } },
    shellHandler as never,
  )
}

function getAppForEdit(fastify: Fastify) {
  fastify.get<{ Params: { appId: string } }>('/apps/:appId/edit', {
    schema: { tags: ['apps'], summary: 'Get an app by ID including conversation history (prefers draft version)' },
  }, async (request, reply) => {
    const { appId } = request.params
    request.assertAuthenticated()
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
    request.assertAuthenticated()
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
        return reply.code(403).send({ error: 'Free plan is limited to 3 installed apps. Uninstall one or upgrade to Pro.' })
      }
    }

    const [draftVersion] = await fastify.db
      .select({ id: appVersions.id, versionNumber: appVersions.versionNumber })
      .from(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.isDraft, true)))
      .limit(1)

    if (!draftVersion) return reply.code(400).send({ error: 'No draft version to install — build the app first' })

    copyDraftToUserDb(appId, userId)

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

export async function compileTailwindCss(files: Map<string, string>): Promise<string> {
  const userCss = files.get('styles.css') ?? ''
  const cssInput = `@import "tailwindcss";\n${userCss}`
  const compiler = await compile(cssInput, {
    base: join(__dirname, '../..'),
    onDependency: () => { },
  })

  const scanInput: Array<{ content: string; extension: string }> = []
  for (const [path, content] of files) {
    const extMatch = path.match(/\.(tsx?|jsx?)$/)
    if (!extMatch) continue
    scanInput.push({ content, extension: extMatch[1] })
  }

  const scanner = new Scanner({})
  const candidates = scanner.scanFiles(scanInput)

  return compiler.build(candidates)
}

const esmShCache = new Map<string, string>()

// Apps are rendered in iframes, so each bundle ships its own React. Pin canonical
// esm.sh URLs so app code and transitively-resolved esm.sh packages all dedupe to
// the same React instance (avoids hook errors from a duplicated ReactCurrentDispatcher).
//
// The esm.sh "surface" URL (e.g. https://esm.sh/react@19) returns a thin wrapper
// that does `export * from ".../X.Y.Z/es2022/react.mjs"` AND `export { default }
// from ".../X.Y.Z/es2022/react.mjs"` — the duplicate `default` re-export trips
// esbuild's cycle detection. We resolve those surface URLs to their underlying
// versioned .mjs files once at startup so esbuild only ever bundles the leaf.
const REACT_VERSION = '19'
let REACT_URL = `https://esm.sh/react@${REACT_VERSION}`
let REACT_JSX_RUNTIME_URL = `https://esm.sh/react@${REACT_VERSION}/jsx-runtime`
let REACT_DOM_URL = `https://esm.sh/react-dom@${REACT_VERSION}`
let REACT_DOM_CLIENT_URL = `https://esm.sh/react-dom@${REACT_VERSION}/client`

let reactUrlsResolved = false
async function resolveReactUrls(): Promise<void> {
  if (reactUrlsResolved) return
  // Follow each wrapper's `export * from "..."` to its real versioned .mjs URL.
  async function follow(wrapperUrl: string): Promise<string> {
    const res = await fetch(wrapperUrl)
    if (!res.ok) throw new Error(`Failed to resolve ${wrapperUrl}: ${res.status}`)
    const body = await res.text()
    const m = body.match(/export\s+\*\s+from\s+["']([^"']+)["']/)
    if (!m) return wrapperUrl // no wrapper, use as-is
    return new URL(m[1], wrapperUrl).toString()
  }
  ;[REACT_URL, REACT_JSX_RUNTIME_URL, REACT_DOM_URL, REACT_DOM_CLIENT_URL] = await Promise.all([
    follow(REACT_URL),
    follow(REACT_JSX_RUNTIME_URL),
    follow(REACT_DOM_URL),
    follow(REACT_DOM_CLIENT_URL),
  ])
  reactUrlsResolved = true
}

// Virtual entry point — wraps the user's index.tsx with a React root mount.
const ENTRY_SOURCE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './index.tsx';

// Reset the pathname to '/' so browser-history routers (e.g. TanStack Router)
// match routes correctly. The <base> tag is left intact so relative fetches still
// resolve to the correct /apps/:id/... paths.
if (typeof window !== 'undefined' && window.location.pathname !== '/') {
  history.replaceState(null, '', '/');
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(React.createElement(App, { data: {} }));
}
`

// 'db' module → fetches /apps/:appId/db/query using __APP_CONTEXT__ injected into the HTML shell.
const DB_SHIM = `
export async function query(sql, params) {
  const ctx = (typeof window !== 'undefined' && window.__APP_CONTEXT__) || {};
  if (!ctx.appId) throw new Error('db: __APP_CONTEXT__.appId missing');
  const url = '/apps/' + ctx.appId + '/db/query' + (ctx.draft ? '?draft=true' : '');
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
`

// Back-compat shim for apps written against the legacy `router` module
// (hash-based routing). New apps should import a real router library instead.
const ROUTER_SHIM = `
import * as React from 'react';
export function useRouter() {
  const [path, setPath] = React.useState(function(){ return window.location.hash.slice(1) || '/'; });
  React.useEffect(function(){
    var handler = function(){ setPath(window.location.hash.slice(1) || '/'); };
    window.addEventListener('hashchange', handler);
    return function(){ window.removeEventListener('hashchange', handler); };
  }, []);
  var navigate = React.useCallback(function(to){ window.location.hash = to; }, []);
  return { path: path, navigate: navigate };
}
export function Link(props) {
  var to = props.to, children = props.children, rest = {};
  for (var k in props) if (k !== 'to' && k !== 'children') rest[k] = props[k];
  rest.href = '#' + to;
  return React.createElement('a', rest, children);
}
`

// 'ai' module → fetches /ai/generate (requires authenticated session).
const AI_SHIM = `
export async function generateText({ prompt, system, model }) {
  const res = await fetch('/ai/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system, model }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).text;
}
`

export async function compileVirtualFiles(files: Map<string, string>): Promise<string> {
  await resolveReactUrls()
  const result = await build({
    entryPoints: ['__entry__.tsx'],
    bundle: true,
    format: 'esm',
    write: false,
    jsx: 'automatic',
    target: 'es2020',
    plugins: [
      {
        name: 'virtual-fs',
        setup(b) {
          // Virtual entry point — bootstraps the user's index.tsx into a React root.
          b.onResolve({ filter: /^__entry__\.tsx$/ }, () => ({ path: '__entry__.tsx', namespace: 'virtual' }))

          // 'db', 'ai', 'router' → resolve to inline shim ESM source (HTTP calls to our API).
          b.onResolve({ filter: /^(db|ai|router)$/ }, args => ({ path: args.path, namespace: 'app-shim' }))
          b.onLoad({ filter: /^(db|ai|router)$/, namespace: 'app-shim' }, args => ({
            contents: args.path === 'db' ? DB_SHIM : args.path === 'ai' ? AI_SHIM : ROUTER_SHIM,
            loader: 'js' as const,
          }))

          // React / React-DOM → canonical esm.sh URLs so transitive imports dedupe.
          b.onResolve({ filter: /^react$/ }, () => ({ path: REACT_URL, namespace: 'esm-sh' }))
          b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: REACT_JSX_RUNTIME_URL, namespace: 'esm-sh' }))
          b.onResolve({ filter: /^react-dom$/ }, () => ({ path: REACT_DOM_URL, namespace: 'esm-sh' }))
          b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: REACT_DOM_CLIENT_URL, namespace: 'esm-sh' }))

          b.onResolve({ filter: /^@\// }, args => {
            const relativePath = args.path.slice(2) // '@/lib/utils' → 'lib/utils'
            const resolved = resolveVirtualPath('', relativePath, files)
            if (resolved) return { path: resolved, namespace: 'virtual' }
            return null
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
            if (args.path === '__entry__.tsx') return { contents: ENTRY_SOURCE, loader: 'tsx' as const }
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
          //
          // @radix-ui/* packages are fetched in ?bundle mode so esm.sh collapses their
          // internal import graph into a single self-contained file. Without this, esbuild
          // has to follow dozens of relative intra-package imports, many of which fail.
          // React/react-dom are peer deps of radix-ui so esm.sh still externalises them
          // (emits `import ... from "https://esm.sh/react@..."`) and our React-normalisation
          // resolver below catches and dedupes those imports as usual.
          //
          // Same treatment for lucide-react which ships hundreds of individual icon chunks.
          const BUNDLED_PACKAGES = /^@radix-ui\/|^lucide-react(\/|$)/
          b.onResolve({ filter: /^[^./]/ }, args => {
            if (/\.(tsx?|css|json)$/.test(args.path)) return null
            const base = `https://esm.sh/${args.path}`
            if (BUNDLED_PACKAGES.test(args.path)) return { path: `${base}?bundle`, namespace: 'esm-sh' }
            return { path: base, namespace: 'esm-sh' }
          })
          // Normalize React / React-DOM transitive imports within esm.sh-resolved code
          // to the canonical pinned URLs so we never bundle two copies.
          b.onResolve({ filter: /.*/, namespace: 'esm-sh' }, args => {
            const resolved = new URL(args.path, args.importer).toString()
            if (/esm\.sh\/(v\d+\/)?(@\d+\/)?react(@|\?|\/|$)/.test(resolved) && !/react-dom/.test(resolved)) {
              if (/jsx-runtime|jsx-dev-runtime/.test(resolved)) return { path: REACT_JSX_RUNTIME_URL, namespace: 'esm-sh' }
              return { path: REACT_URL, namespace: 'esm-sh' }
            }
            if (/esm\.sh\/(v\d+\/)?(@\d+\/)?react-dom(@|\?|\/|$)/.test(resolved)) {
              if (/\/client/.test(resolved)) return { path: REACT_DOM_CLIENT_URL, namespace: 'esm-sh' }
              return { path: REACT_DOM_URL, namespace: 'esm-sh' }
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
  displayHistory: apps.displayHistory,
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

    if (modelOverride) {
      const allowed = ['claude-opus-4-7', 'claude-sonnet-4-6']
      if (process.env.NODE_ENV !== 'production' || request.isAdmin()) allowed.push('deepseek-v4-flash')
      if (!allowed.includes(modelOverride)) {
        return reply.code(400).send({ error: 'Invalid model specified' })
      }
    }

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

    const [subRow] = await fastify.db
      .select({ plan: userSubscriptions.plan })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .limit(1)
    const userPlan = subRow?.plan ?? 'free'
    const lowCreditsThreshold = userPlan === 'pro' ? 5 : 3

    const targetVersionNumber = draftRow.versionNumber
    const draftVersionId = draftRow.id
    const buildSessionId = randomUUID()

    const ac = new AbortController()

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    const abortOnDisconnect = () => {
      if (!ac.signal.aborted) {
        fastify.log.info({ appId, buildSessionId }, 'client disconnected, aborting build')
        ac.abort()
      }
    }
    request.raw.on('close', abortOnDisconnect)
    reply.raw.on('close', abortOnDisconnect)

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let lowCreditsEmitted = false

    const appFs = await getAppFs(fastify, appId)


    const history = (Array.isArray(app.conversationHistory) ? app.conversationHistory : []) as Anthropic.MessageParam[]
    const storedDisplay = Array.isArray(app.displayHistory) ? (app.displayHistory as DisplayMessage[]) : []

    // Detect resume: last displayHistory question is unanswered AND conversationHistory ends
    // with an assistant message containing an ask_user tool_use block.
    const pendingQuestion = [...storedDisplay].reverse().find(m => m.role === 'question' && !m.answer) as
      | (DisplayMessage & { role: 'question' }) | undefined
    const lastHistoryMsg = history[history.length - 1]
    const askUserBlock = pendingQuestion && lastHistoryMsg?.role === 'assistant'
      ? (lastHistoryMsg.content as Anthropic.ContentBlock[]).find(
        b => b.type === 'tool_use' && (b as Anthropic.ToolUseBlock).name === 'ask_user'
      ) as Anthropic.ToolUseBlock | undefined
      : undefined
    const isResume = !!(pendingQuestion && askUserBlock)

    const isRefinement = history.length > 0
    // Cache the prior conversation so re-sent history is not re-billed on refinement.
    const cachedHistory = isRefinement ? markLastTurnCacheable(history) : history

    let displayMsgs: DisplayMessage[]
    let messages: Anthropic.MessageParam[]

    if (isResume) {
      // Resume: userMessage is the answer. Update displayHistory and inject the tool_result.
      displayMsgs = storedDisplay.map(m =>
        m.role === 'question' && m.questionId === pendingQuestion.questionId ? { ...m, answer: userMessage } : m
      )
      displayMsgs.push({ role: 'user', content: userMessage })
      messages = [
        ...markLastTurnCacheable(history),
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: askUserBlock!.id, content: JSON.stringify({ answer: userMessage }) }],
        },
      ]
    } else {
      messages = [...cachedHistory, { role: 'user', content: userMessage }]
      displayMsgs = isRefinement ? [...storedDisplay] : []
      displayMsgs.push({ role: 'user', content: userMessage })
    }

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

    // Tracks which phase is currently running so paused questions know where to resume.
    let currentPhase: 'planning1' | 'planning2' | 'build' = 'planning1'

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
        const question = input.question as string
        const suggestions = (input.suggestions as string[] | undefined) ?? []
        displayMsgs.push({ role: 'question', questionId, question, suggestions, answer: undefined, buildPhase: currentPhase })
        sendEvent('user_question', { questionId, question, suggestions })
        throw new PauseForQuestionError(questionId)
      },
    }

    async function saveProgress(msgs: Anthropic.MessageParam[], display: DisplayMessage[]) {
      await fastify.db
        .update(apps)
        .set({
          conversationHistory: stripCacheControl(msgs) as unknown[],
          displayHistory: display as unknown[],
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appId))
    }

    let buildMessages: Anthropic.MessageParam[] = messages
    // liveMessages always points to the array currently being mutated by the running runAgentLoop call,
    // so the catch block can save the right state when PauseForQuestionError is thrown.
    let liveMessages: Anthropic.MessageParam[] = messages

    try {

      const planningModel = process.env.PLANNING_MODEL || 'claude-sonnet-4-6'


      const sharedAgentParams = {
        model: 'deepseek-v4-flash',
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
            const credits = microUnitsToCredits(newBalance)
            if (credits <= lowCreditsThreshold) {
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
          const draft = openDraftDb(appId, userId)
          try { draft.exec(schemaSQL) } catch (error) {
            return { error: error instanceof Error ? error.message : 'Unknown error during database setup' }
          } finally {
            draft.close()
          }
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



      // Planning phases are internal — don't stream text/thinking to the client.
      const silentAgentParams = { ...sharedAgentParams, onThinking: () => { }, onText: () => { }, onToolCall: () => { } }

      const resumePhase = isResume ? (pendingQuestion?.buildPhase ?? 'build') : null

      if (!isRefinement || resumePhase === 'planning1') {
        if (resumePhase === 'planning1') {
          // Resume inside planning phase 1: messages already has the tool_result injected
          currentPhase = 'planning1'
          liveMessages = messages
          buildMessages = await runAgentLoop({
            effort: 'medium',
            messages,
            tools: [
              askUserTool,
              appFs.readFileTool,
              appFs.readFileRangeTool,
              appFs.grepFileTool,
              appFs.searchFilesTool,
              appFs.listFilesTool,
            ],
            system: PRODUCT_PLAN_SYSTEM,
            ...silentAgentParams,
            model: planningModel,
          })
        } else {
          // Fresh build: start planning phase 1 from scratch
          sendEvent('text', { text: 'Gathering Scope Information\n' })
          const phase1Msgs: Anthropic.MessageParam[] = [{ role: 'user', content: 'create an implementation plan for this user request\n' + userMessage }]
          currentPhase = 'planning1'
          liveMessages = phase1Msgs
          buildMessages = await runAgentLoop({
            effort: 'medium',
            messages: phase1Msgs,
            tools: [
              askUserTool,
              appFs.readFileTool,
              appFs.readFileRangeTool,
              appFs.grepFileTool,
              appFs.searchFilesTool,
              appFs.listFilesTool,
            ],
            system: PRODUCT_PLAN_SYSTEM,
            ...silentAgentParams,
            model: planningModel,
          })
        }

        await saveProgress(buildMessages, displayMsgs)

        // Fall through to planning phase 2
        sendEvent('text', { text: 'Choosing the style direction\n' })
        const phase2Msgs: Anthropic.MessageParam[] = [...buildMessages, { role: 'user', content: 'now implement the design system. here is the content of the styles.css, use the write_file tool to completly replace it with the new design' + '\n\n' + (appFs.files.get('styles.css') ?? '') }]
        currentPhase = 'planning2'
        liveMessages = phase2Msgs
        buildMessages = await runAgentLoop({
          effort: 'medium',
          messages: phase2Msgs,
          tools: [
            askUserTool,
            appFs.strReplaceTool,
            appFs.writeFileTool,
            appFs.readFileTool,
            appFs.readFileRangeTool,
            appFs.grepFileTool,
            appFs.searchFilesTool,
            appFs.listFilesTool,
          ],
          system: PLAN_SYSTEM,
          ...silentAgentParams,
          model: planningModel,
        })

        await saveProgress(buildMessages, displayMsgs)
      } else if (resumePhase === 'planning2') {
        // Resume inside planning phase 2: messages already has the tool_result injected
        currentPhase = 'planning2'
        liveMessages = messages
        buildMessages = await runAgentLoop({
          effort: 'medium',
          messages,
          tools: [
            askUserTool,
            appFs.strReplaceTool,
            appFs.writeFileTool,
            appFs.readFileTool,
            appFs.readFileRangeTool,
            appFs.grepFileTool,
            appFs.searchFilesTool,
            appFs.listFilesTool,
          ],
          system: PLAN_SYSTEM,
          ...silentAgentParams,
          model: planningModel,
        })

        await saveProgress(buildMessages, displayMsgs)
      }


      const buildLoopParams = {
        tools: buildTools,
        system: BUILD_SYSTEM,
        maxTokens: 20000,
        ...sharedAgentParams,
      }

      async function runBuildWithRetry(msgs: Anthropic.MessageParam[]): Promise<Anthropic.MessageParam[]> {
        currentPhase = 'build'
        liveMessages = msgs
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
          fastify.log.info(`Compile failed (attempt ${attempt + 1}/${MAX_COMPILE_RETRIES}), retrying agent loop with updated messages...`)
          currentPhase = 'build'
          liveMessages = retryMsgs
          result = await runAgentLoop({ messages: retryMsgs, ...buildLoopParams, effort: 'medium' })
        }
        return result
      }

      const buildStartMsgs: Anthropic.MessageParam[] = isResume && resumePhase === 'build'
        ? messages  // already has the tool_result injected
        : [...markLastTurnCacheable(buildMessages), { role: 'user' as const, content: 'execute the implementation plan' }]
      allMessages = await runBuildWithRetry(buildStartMsgs)

      const buildText = lastAssistantText(allMessages)
      if (buildText) displayMsgs.push({ role: 'assistant', content: buildText })
      await saveProgress(allMessages, displayMsgs)

      if (appFs.files.size > 0) {
        const updated = await loadAppWithVersionNumber(fastify.db, appId, targetVersionNumber)
        sendEvent('widget', updated)

        // Runtime verification: ask the frontend to mount the widget and report
        // back any render/runtime errors. If errors come back, run another agent
        // turn with the error as context, up to MAX_RUNTIME_RETRIES times.
        const MAX_RUNTIME_RETRIES = 2
        const RUNTIME_CHECK_TIMEOUT_MS = 15000
        for (let attempt = 0; attempt <= MAX_RUNTIME_RETRIES; attempt++) {
          const checkId = randomUUID()
          const result = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
            const timer = setTimeout(() => {
              pendingRuntimeChecks.delete(checkId)
              resolve({ ok: true })
            }, RUNTIME_CHECK_TIMEOUT_MS)
            pendingRuntimeChecks.set(checkId, (r) => {
              clearTimeout(timer)
              resolve(r)
            })
            const onAbort = () => {
              clearTimeout(timer)
              pendingRuntimeChecks.delete(checkId)
              reject(ac.signal.reason ?? new DOMException('Aborted', 'AbortError'))
            }
            if (ac.signal.aborted) return onAbort()
            ac.signal.addEventListener('abort', onAbort, { once: true })
            sendEvent('runtime_check', { checkId, attempt, maxAttempts: MAX_RUNTIME_RETRIES })
          })

          if (result.ok || !result.error) break
          if (attempt === MAX_RUNTIME_RETRIES) {
            sendEvent('error', { message: `Runtime error in preview: ${result.error}` })
            break
          }

          const retryMsgs = freshCacheable(allMessages)
          retryMsgs.push({ role: 'user', content: `Runtime error in preview:\n\n${result.error}\n\nPlease fix the issue.` })
          fastify.log.info({ appId, attempt: attempt + 1 }, 'runtime error reported, retrying agent loop')
          allMessages = await runBuildWithRetry(retryMsgs)
          await saveProgress(allMessages, displayMsgs)
          const refreshed = await loadAppWithVersionNumber(fastify.db, appId, targetVersionNumber)
          sendEvent('widget', refreshed)
        }
      }
    } catch (err) {
      if (err instanceof PauseForQuestionError) {
        // Save FIRST so a page reload after this point shows the question.
        // liveMessages already has the assistant turn with the ask_user tool_use block.
        try { await saveProgress(liveMessages, displayMsgs) } catch (e) { fastify.log.warn(e, 'failed to save progress on pause') }
        sendEvent('paused', { questionId: err.questionId })
        if (!reply.raw.writableEnded) reply.raw.end()
        return
      }
      compileAndPersist().catch(e => fastify.log.warn(e, 'failed to save progress after error'))
      const isAbort = ac.signal.aborted || (err instanceof Error && err.name === 'AbortError')
      if (isAbort) {
        // No session-scoped tracking for runtime checks — they live only for the
        // duration of a single Promise resolved by /apps/build/runtime-result or
        // by the AbortSignal listener we register inline.
        try { await saveProgress(buildMessages, displayMsgs) } catch (e) { fastify.log.warn(e, 'failed to save progress on cancel') }
        if (!reply.raw.writableEnded) sendEvent('cancelled', {})
        fastify.log.info({ appId, buildSessionId }, 'app build cancelled by client')
      } else if (err instanceof InsufficientCreditsError) {
        sendEvent('error', { code: 'insufficient_credits', message: 'You have run out of credits, add more credits from account page to continue.' })
      } else {
        fastify.log.error(err, 'app build error')
        sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    if (!reply.raw.writableEnded) {
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
    const userId = request.assertAuthenticated()
    const { sql, params = [] } = request.body
    const db = request.query.draft === 'true' ? openDraftDb(appId, userId) : openUserDb(appId, userId)
    try {
      const stmt = db.prepare(sql)
      const rows = stmt.reader ? stmt.all(...params) : (() => { stmt.run(...params); return [] })()
      return reply.send({ rows })
    } finally {
      db.close()
    }
  })
}


function runtimeResult(fastify: Fastify) {
  fastify.post<{ Body: { checkId: string; ok: boolean; error?: string } }>('/apps/build/runtime-result', {
    schema: {
      tags: ['apps'],
      summary: 'Report preview runtime verification result back to a waiting build session',
      body: {
        type: 'object',
        properties: {
          checkId: { type: 'string' },
          ok: { type: 'boolean' },
          error: { type: 'string' },
        },
        required: ['checkId', 'ok'],
      },
    },
  }, async (request, reply) => {
    request.assertAuthenticated()
    const { checkId, ok, error } = request.body
    const resolve = pendingRuntimeChecks.get(checkId)
    if (!resolve) return reply.code(404).send({ error: 'check not found or already resolved' })
    pendingRuntimeChecks.delete(checkId)
    resolve({ ok, error })
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
    request.assertAdmin()

    const app = await fastify.db
      .select({ creatorId: apps.creatorId })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)
    if (!app[0]) return reply.code(404).send({ error: 'App not found' })

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

function adminListApps(fastify: Fastify) {
  fastify.get('/admin/apps', {
    schema: { tags: ['apps', 'admin'], summary: 'List all apps with source files (admin)' },
  }, async (request, reply) => {
    request.assertAdmin()

    const rows = await fastify.db
      .select({
        id: apps.id,
        name: apps.name,
        description: apps.description,
        creatorId: apps.creatorId,
        latestVersionNumber: apps.latestVersionNumber,
        createdAt: apps.createdAt,
        updatedAt: apps.updatedAt,
        versionNumber: appVersions.versionNumber,
        isDraft: appVersions.isDraft,
        sourceFiles: appVersions.sourceFiles,
        compiledCode: appVersions.compiledCode,
        cssCode: appVersions.cssCode,
      })
      .from(apps)
      .leftJoin(
        appVersions,
        and(
          eq(appVersions.appId, apps.id),
          eq(appVersions.versionNumber, apps.latestVersionNumber),
        ),
      )
      .orderBy(desc(apps.updatedAt))

    return reply.send(rows)
  })
}

export default appsPlugin
