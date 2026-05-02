import {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawServerDefault,
  type FastifyPluginAsync,
} from 'fastify'
import { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { build } from 'esbuild'
import Anthropic from '@anthropic-ai/sdk'
import { widgets } from '../db/schema'
import { runAgentLoop, cached } from '../agent'

type Fastify = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  FastifyTypeProviderDefault
>

// System prompts — loaded once, wrapped with cache_control for prompt caching
const PLAN_SYSTEM          = cached(readFileSync(join(__dirname, '../prompts/widget-plan.md'), 'utf8'))
const DESIGN_SYSTEM_PROMPT = cached(readFileSync(join(__dirname, '../prompts/widget-design-system.md'), 'utf8'))
const BUILD_SYSTEM         = cached(readFileSync(join(__dirname, '../prompts/widget-build.md'), 'utf8'))
const POLISH_SYSTEM        = cached(readFileSync(join(__dirname, '../prompts/widget-polish.md'), 'utf8'))
const CRITIC_SYSTEM        = cached(readFileSync(join(__dirname, '../prompts/widget-critic.md'), 'utf8'))

// Deferred promises waiting for user answers, keyed by question ID
const pendingQuestions = new Map<string, (answer: string) => void>()

const widgetsPlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  listWidgets(fastify)
  createWidget(fastify)
  getWidget(fastify)
  patchWidget(fastify)
  deleteWidget(fastify)
  buildWidget(fastify)
  answerWidgetQuestion(fastify)
}

function sseHeaders(origin?: string) {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': origin ?? '*',
  }
}

function listWidgets(fastify: Fastify) {
  fastify.get('/widgets', {
    schema: { tags: ['Widgets'], summary: 'List all widgets' },
  }, async (_request, reply) => {
    const result = await fastify.db
      .select({
        id: widgets.id,
        name: widgets.name,
        description: widgets.description,
        status: widgets.status,
        createdAt: widgets.createdAt,
        updatedAt: widgets.updatedAt,
      })
      .from(widgets)
      .orderBy(desc(widgets.createdAt))
    return reply.send(result)
  })
}

function createWidget(fastify: Fastify) {
  fastify.post<{ Body: { name: string } }>('/widgets', {
    schema: {
      tags: ['Widgets'],
      summary: 'Create a draft widget',
      body: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const [widget] = await fastify.db
      .insert(widgets)
      .values({ name: request.body.name })
      .returning()
    return reply.code(201).send(widget)
  })
}

function getWidget(fastify: Fastify) {
  fastify.get<{ Params: { widgetId: string } }>('/widgets/:widgetId', {
    schema: { tags: ['Widgets'], summary: 'Get a widget by ID' },
  }, async (request, reply) => {
    const [widget] = await fastify.db
      .select()
      .from(widgets)
      .where(eq(widgets.id, request.params.widgetId))
    if (!widget) return reply.code(404).send({ error: 'Widget not found' })
    return reply.send(widget)
  })
}

function patchWidget(fastify: Fastify) {
  fastify.patch<{
    Params: { widgetId: string }
    Body: { name?: string; description?: string; status?: 'draft' | 'published' }
  }>('/widgets/:widgetId', {
    schema: {
      tags: ['Widgets'],
      summary: 'Update widget name, description, or status',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published'] },
        },
      },
    },
  }, async (request, reply) => {
    const { widgetId } = request.params
    const patch = request.body
    const [updated] = await fastify.db
      .update(widgets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(widgets.id, widgetId))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Widget not found' })
    return reply.send(updated)
  })
}

function deleteWidget(fastify: Fastify) {
  fastify.delete<{ Params: { widgetId: string } }>('/widgets/:widgetId', {
    schema: { tags: ['Widgets'], summary: 'Delete a widget' },
  }, async (request, reply) => {
    await fastify.db.delete(widgets).where(eq(widgets.id, request.params.widgetId))
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
    external: ['react', 'framer-motion', '@/components/ui/*', '@/lib/utils'],
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
// Build widget route
// ---------------------------------------------------------------------------

function buildWidget(fastify: Fastify) {
  fastify.post<{ Body: { widgetId: string; userMessage: string } }>('/widgets/build', {
    schema: {
      tags: ['Widgets'],
      summary: 'Build or refine a widget via AI agent (SSE)',
      body: {
        type: 'object',
        properties: {
          widgetId: { type: 'string' },
          userMessage: { type: 'string' },
        },
        required: ['widgetId', 'userMessage'],
      },
    },
  }, async (request, reply) => {
    const { widgetId, userMessage } = request.body

    const [widget] = await fastify.db.select().from(widgets).where(eq(widgets.id, widgetId))
    if (!widget) return reply.code(404).send({ error: 'Widget not found' })

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const agentState = {
      name: widget.name,
      description: widget.description,
      compiledCode: widget.compiledCode,
    }

    const virtualFiles = new Map<string, string>()

    // Seed with existing source files for refinement requests
    if (Array.isArray(widget.sourceFiles)) {
      for (const f of widget.sourceFiles as Array<{ path: string; content: string }>) {
        virtualFiles.set(f.path, f.content)
      }
    }

    const history = (Array.isArray(widget.conversationHistory) ? widget.conversationHistory : []) as Anthropic.MessageParam[]
    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userMessage }]

    async function compileAndPersist(): Promise<{ success: true } | { error: string }> {
      try {
        const compiled = await compileVirtualFiles(virtualFiles)
        agentState.compiledCode = compiled
        const cssCode = virtualFiles.get('styles.css') ?? null
        const sourceFilesArray = [...virtualFiles.entries()].map(([path, content]) => ({ path, content }))
        await fastify.db
          .update(widgets)
          .set({ compiledCode: compiled, cssCode, sourceFiles: sourceFilesArray, updatedAt: new Date() })
          .where(eq(widgets.id, widgetId))
        return { success: true }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Compile failed' }
      }
    }

    const writeFileTool = {
      name: 'write_file',
      description: 'Write or overwrite a file in the widget project. Entry point must be "index.tsx". Add files like "components/Card.tsx", "hooks/useData.ts" as needed.',
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
      description: 'List all files currently written in the widget project.',
      input_schema: { type: 'object' as const, properties: {} },
      handler: async () => ({ files: [...virtualFiles.keys()] }),
    }

    const askUserTool = {
      name: 'ask_user',
      description: 'Ask the user a clarifying question before building. Use this when the request is ambiguous or missing key information needed to design the widget. Ask at most 1-2 focused questions.',
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
      // -----------------------------------------------------------------------
      // PASS 0 — Plan (with ask_user tool for clarification)
      // -----------------------------------------------------------------------
      sendEvent('text', { text: '**Planning the design…**\n\n' })

      const planMessages = await runAgentLoop({
        messages: [{ role: 'user', content: userMessage }],
        tools: [askUserTool],
        system: PLAN_SYSTEM,
        maxTokens: 2048,
        onText: (delta) => sendEvent('text', { text: delta }),
        onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
      })
      const designPlan = extractText(planMessages)

      // -----------------------------------------------------------------------
      // PASS 1 — Design System (creates styles.css)
      // -----------------------------------------------------------------------
      sendEvent('text', { text: '\n\n---\n\n**Creating design system…**\n\n' })

      await runAgentLoop({
        messages: [{ role: 'user', content: `Design plan:\n${designPlan}\n\nCreate the styles.css design system for this widget.` }],
        tools: [writeFileTool],
        system: DESIGN_SYSTEM_PROMPT,
        maxTokens: 16000,
        thinking: { budget_tokens: 8000 },
        onText: (delta) => sendEvent('text', { text: delta }),
        onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
      })

      const designSystemCSS = virtualFiles.get('styles.css') ?? ''

      sendEvent('text', { text: '\n\n---\n\n**Building the widget…**\n\n' })

      // -----------------------------------------------------------------------
      // PASS 2 — Build (extended thinking + cached system prompt)
      // -----------------------------------------------------------------------
      const buildUserMessage = designPlan
        ? `Design plan:\n${designPlan}\n\nDesign system (styles.css already written — use its CSS variables):\n\`\`\`css\n${designSystemCSS}\n\`\`\`\n\nUser request: ${userMessage}`
        : userMessage

      const finalMessages = await runAgentLoop({
        messages: [...messages.slice(0, -1), { role: 'user', content: buildUserMessage }],
        tools: [
          {
            name: 'set_widget_metadata',
            description: 'Set the display name and one-sentence description for the widget.',
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
                .update(widgets)
                .set({ name: agentState.name, description: agentState.description, updatedAt: new Date() })
                .where(eq(widgets.id, widgetId))
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
        onText: (delta) => sendEvent('text', { text: delta }),
        onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
      })

      // Compile after build pass
      if (virtualFiles.size > 0) {
        const compileResult = await compileAndPersist()
        if ('error' in compileResult) {
          sendEvent('error', { message: `Compile error: ${compileResult.error}` })
        }
      }

      await fastify.db
        .update(widgets)
        .set({ conversationHistory: finalMessages as unknown[], updatedAt: new Date() })
        .where(eq(widgets.id, widgetId))

      // -----------------------------------------------------------------------
      // PASS 2 — Polish (cached system prompt)
      // -----------------------------------------------------------------------
      if (virtualFiles.size > 0) {
        sendEvent('text', { text: '\n\n**Polishing the UI…**\n\n' })

        const filesSummary = [...virtualFiles.entries()]
          .map(([path, content]) => {
            const lang = path.endsWith('.css') ? 'css' : 'tsx'
            return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
          })
          .join('\n\n')

        await runAgentLoop({
          messages: [
            {
              role: 'user',
              content: `Design plan:\n${designPlan}\n\nOriginal request: "${userMessage}"\n\nCurrent files:\n${filesSummary}\n\nPolish the UI — keep all functionality identical. Use CSS variables from styles.css throughout. Do NOT modify styles.css.`,
            },
          ],
          tools: [writeFileTool, readFileTool, listFilesTool],
          system: POLISH_SYSTEM,
          maxTokens: 16000,
          onText: (delta) => sendEvent('text', { text: delta }),
          onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
        })

        // Compile after polish
        const polishCompileResult = await compileAndPersist()
        if ('error' in polishCompileResult) {
          sendEvent('error', { message: `Polish compile error: ${polishCompileResult.error}` })
        }
      }

      // -----------------------------------------------------------------------
      // PASS 3 — Critic (no tools, cached system prompt, silent)
      // -----------------------------------------------------------------------
      if (virtualFiles.size > 0) {
        sendEvent('text', { text: '\n\n**Quality check…**\n\n' })

        const filesSummary = [...virtualFiles.entries()]
          .map(([path, content]) => {
            const lang = path.endsWith('.css') ? 'css' : 'tsx'
            return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
          })
          .join('\n\n')

        const criticMessages = await runAgentLoop({
          messages: [{ role: 'user', content: filesSummary }],
          system: CRITIC_SYSTEM,
          maxTokens: 512,
          onText: (delta) => sendEvent('text', { text: delta }),
        })

        const criticOutput = extractText(criticMessages).trim()

        // -----------------------------------------------------------------------
        // PASS 4 — Fix (only if critic found issues)
        // -----------------------------------------------------------------------
        if (criticOutput && criticOutput !== 'PASS') {
          sendEvent('text', { text: '\n\n**Fixing identified issues…**\n\n' })

          const currentFilesSummary = [...virtualFiles.entries()]
            .map(([path, content]) => {
              const lang = path.endsWith('.css') ? 'css' : 'tsx'
              return `### ${path}\n\`\`\`${lang}\n${content}\n\`\`\``
            })
            .join('\n\n')

          await runAgentLoop({
            messages: [
              {
                role: 'user',
                content: `The following design issues were found:\n${criticOutput}\n\nFix only these specific issues in the relevant files. Keep everything else unchanged.\n\nCurrent files:\n${currentFilesSummary}`,
              },
            ],
            tools: [writeFileTool, readFileTool, listFilesTool],
            system: POLISH_SYSTEM,
            maxTokens: 16000,
            onText: (delta) => sendEvent('text', { text: delta }),
            onToolCall: (name, input, result) => sendEvent('tool_call', { name, input, result }),
          })

          const fixCompileResult = await compileAndPersist()
          if ('error' in fixCompileResult) {
            sendEvent('error', { message: `Fix compile error: ${fixCompileResult.error}` })
          }
        }
      }

      const [updated] = await fastify.db.select().from(widgets).where(eq(widgets.id, widgetId))
      sendEvent('widget', updated)
    } catch (err) {
      fastify.log.error(err, 'Widget build error')
      sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
    }

    sendEvent('done', {})
    reply.raw.end()
  })
}

function answerWidgetQuestion(fastify: Fastify) {
  fastify.post<{ Body: { questionId: string; answer: string } }>('/widgets/answer', {
    schema: {
      tags: ['Widgets'],
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

export default widgetsPlugin
