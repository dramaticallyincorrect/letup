import { FastifyBaseLogger, FastifyInstance, FastifyTypeProviderDefault, RawServerDefault, type FastifyPluginAsync } from 'fastify'
import { columns, boards as boardsTable, cards } from '../db/schema'
import { eq, max, asc } from 'drizzle-orm'
import { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { transform } from 'esbuild'


type Fastify = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>

const boards: FastifyPluginAsync = async (fastify): Promise<void> => {

  getAllBoards(fastify)

  addBoard(fastify)
  getBoard(fastify)
  deleteBoard(fastify)

  addColumn(fastify)
  deleteColumn(fastify)
  runColumnAgent(fastify)
  addCard(fastify)
  moveCard(fastify)
  patchCardMetadata(fastify)

  runPipeline(fastify)
}

function getAllBoards(fastify: Fastify) {
  fastify.get('/boards', {
    schema: { tags: ['Boards'], summary: 'List all boards' },
  }, async (_request, reply) => {
    const result = await fastify.db.select().from(boardsTable)
    return reply.send(result)
  })
}

function addBoard(fastify: Fastify) {
  fastify.post<{
    Body: {
      name: string
    }
  }>('/boards', {
    schema: {
      tags: ['Boards'],
      summary: 'Create a board',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name'],
      }
    },
  }, async (request, reply) => {
    const name = request.body.name

    const result = await fastify.db.transaction(async (tx) => {

      const createdBoard = await tx
        .insert(boardsTable)
        .values({
          name
        })
        .returning()


      await tx.insert(columns).values({
        boardId: createdBoard[0].id,
        name: 'To Do',
        position: 0,
      })

      return createdBoard[0]
    })

    return reply.code(201).send(result)
  })
}

function getBoard(fastify: Fastify) {
  return fastify.get<{ Params: { boardId: string } }>('/boards/:boardId', {
    schema: { tags: ['Boards'], summary: 'Get a board' },
  }, async (request, reply) => {
    const { boardId } = request.params

    const [board] = await fastify.db.select().from(boardsTable).where(eq(boardsTable.id, boardId))
    if (!board) return reply.code(404).send({ error: 'Board not found' })

    const boardColumns = await fastify.db
      .select().from(columns)
      .where(eq(columns.boardId, boardId))
      .orderBy(asc(columns.position))

    const allCards = boardColumns.length
      ? await Promise.all(
        boardColumns.map(col =>
          fastify.db.select().from(cards).where(eq(cards.columnId, col.id)).orderBy(asc(cards.createdAt))
        )
      )
      : []

    return reply.send({
      ...board,
      columns: boardColumns.map((col, i) => {
        const { dataSchema: _ds, ...colPublic } = col
        return { ...colPublic, cards: allCards[i] ?? [] }
      }),
    })
  })
}

function deleteBoard(fastify: Fastify) {
  fastify.delete<{
    Params: { boardId: string }
  }>('/boards/:boardId', {
    schema: { tags: ['Boards'], summary: 'Delete board' },
  }, async (request, reply) => {
    const result = await fastify.db.delete(boardsTable).where(eq(boardsTable.id, request.params.boardId))
    return reply.send(result)
  })
}

type AgentState = {
  dataSchema?: unknown
  cardRenderer?: string
}

async function runAgentLoop(
  fastify: Fastify,
  prompt: string,
  sendEvent: (event: string, data: unknown) => void
): Promise<AgentState> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const tools: Anthropic.Tool[] = [
    {
      name: 'set_data_schema',
      description: 'Set the JSON Schema that describes the data structure for cards in this column which will be the data passed into the card renderer function. Use standard JSON Schema format.',
      input_schema: {
        type: 'object' as const,
        properties: {
          schema: {
            type: 'object' as const,
            description: 'A valid JSON Schema object describing the card data structure',
          },
        },
        required: ['schema'],
      },
    },
    {
      name: 'set_card_renderer',
      description: `Set a React TypeScript component that renders part of a trello card the renderer is placed below the description. Must be a valid .tsx file with a default-exported React component.

The component receives two props:
- \`metadata\`: typed to match the data_schema — the structured data for this card
- \`patchMetadata\`: \`(patch: Record<string, unknown>) => Promise<void>\` — call this to persist renderer state. The patch is shallow-merged into the card's stored data, so only include the keys you want to update.

React is available as an external import. Use React.useState for local state.

important: tailwind css is available

Example — a quiz card that remembers the user's answer:
\`\`\`tsx
import React, { useState } from 'react'

type Metadata = { question: string; options: string[]; correct_answer: string; userSelected?: string }

export default function QuizCard({ metadata, patchMetadata }: {
  metadata: Metadata
  patchMetadata: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(metadata.userSelected ?? null)

  async function handleSelect(option: string) {
    setSelected(option)
    await patchMetadata({ userSelected: option })
  }

  return (
    <div>
      <p>{metadata.question}</p>
      {metadata.options.map(opt => (
        <button key={opt} onClick={() => handleSelect(opt)}
          style={{ fontWeight: selected === opt ? 'bold' : 'normal' }}>
          {opt} {selected === opt && (opt === metadata.correct_answer ? '✓' : '✗')}
        </button>
      ))}
    </div>
  )
}
\`\`\`

Example — a rating card:
\`\`\`tsx
import React, { useState } from 'react'

type Metadata = { label: string; userRating?: number }

export default function RatingCard({ metadata, patchMetadata }: {
  metadata: Metadata
  patchMetadata: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [rating, setRating] = useState<number | null>(metadata.userRating ?? null)

  async function handleRate(n: number) {
    setRating(n)
    await patchMetadata({ userRating: n })
  }

  return (
    <div>
      <p>{metadata.label}</p>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => handleRate(n)}
          style={{ color: rating !== null && n <= rating ? 'gold' : 'gray' }}>★</button>
      ))}
    </div>
  )
}
\`\`\``,
      input_schema: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: 'React TypeScript (TSX) source code with a default-exported component accepting `metadata` and `patchMetadata` props',
          },
        },
        required: ['code'],
      },
    },
  ]

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  const agentState: AgentState = {}

  try {
    let continueLoop = true
    while (continueLoop) {
      fastify.log.info({ messages }, 'runAgentLoop: sending messages to Claude')
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 8192,
        system: `You are an agent that configures Kanban board columns. When a user describes what kind of column they want, you must call BOTH tools in order:

STEP 1 — call set_data_schema once to define the JSON Schema for card data in this column.
STEP 2 — call set_card_renderer once to provide the React component that will render every card in this column.

These tools configure the COLUMN, not individual cards. You call them exactly once each, then you are done.

## set_card_renderer rules

- The code you provide is compiled once and stored on the column. It is NOT run by you — it runs in the user's browser each time a card is displayed.
- The component receives two runtime props injected by the host application:
  - \`metadata\` — the structured data for that specific card, typed to match your schema
  - \`patchMetadata(patch)\` — an async function the component can call to persist interactive state (selections, ratings, etc.) back to the card. Do NOT call patchMetadata yourself or generate code that calls it at module load time — only call it inside user event handlers (onClick, onChange, etc.).
- React is available as an external. Use React.useState for local UI state.
- Do NOT put any code in card data / metadata. The renderer code belongs only in the set_card_renderer tool call.

## Correct workflow example (quiz column)

1. Call set_data_schema:
{
  "type": "object",
  "properties": {
    "question": { "type": "string" },
    "options": { "type": "array", "items": { "type": "string" } },
    "correct_answer": { "type": "string" },
    "userSelected": { "type": "string" }
  },
  "required": ["question", "options", "correct_answer"]
}

2. Call set_card_renderer with this component:
\`\`\`tsx
import React, { useState } from 'react'

type Metadata = { question: string; options: string[]; correct_answer: string; userSelected?: string }

export default function QuizCard({ metadata, patchMetadata }: {
  metadata: Metadata
  patchMetadata: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(metadata.userSelected ?? null)

  async function handleSelect(option: string) {
    setSelected(option)
    await patchMetadata({ userSelected: option })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontWeight: 600, margin: 0 }}>{metadata.question}</p>
      {metadata.options.map(opt => (
        <button key={opt} onClick={() => handleSelect(opt)} style={{
          padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer',
          background: selected === opt ? '#dbeafe' : 'white',
          fontWeight: selected === opt ? 700 : 400,
        }}>
          {opt}{selected === opt ? (opt === metadata.correct_answer ? ' ✓' : ' ✗') : ''}
        </button>
      ))}
    </div>
  )
}
\`\`\`

## Another example (rating column)

1. set_data_schema: { label: string, userRating?: number }
2. set_card_renderer:
\`\`\`tsx
import React, { useState } from 'react'

type Metadata = { label: string; userRating?: number }

export default function RatingCard({ metadata, patchMetadata }: {
  metadata: Metadata
  patchMetadata: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [rating, setRating] = useState<number | null>(metadata.userRating ?? null)

  async function handleRate(n: number) {
    setRating(n)
    await patchMetadata({ userRating: n })
  }

  return (
    <div>
      <p style={{ margin: '0 0 4px' }}>{metadata.label}</p>
      <div>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => handleRate(n)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
            color: rating !== null && n <= rating ? 'gold' : '#ccc',
          }}>★</button>
        ))}
      </div>
    </div>
  )
}
\`\`\``,
        messages,
        tools,
      })

      const toolUseBlocks: Map<number, { id: string; name: string; inputJson: string }> = new Map()

      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolUseBlocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, inputJson: '' })
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            sendEvent('text', { text: event.delta.text })
          } else if (event.delta.type === 'input_json_delta') {
            const block = toolUseBlocks.get(event.index)
            if (block) block.inputJson += event.delta.partial_json
          }
        }
      }

      const finalMessage = await stream.finalMessage()
      fastify.log.info({ stop_reason: finalMessage.stop_reason, content: finalMessage.content }, 'runAgentLoop: received final message')

      if (finalMessage.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of toolUseBlocks.values()) {
          const input = JSON.parse(block.inputJson || '{}')
          let result: unknown

          if (block.name === 'set_data_schema') {
            agentState.dataSchema = input.schema
            result = { success: true }
          } else if (block.name === 'set_card_renderer') {
            try {
              const built = await transform(input.code, {
                loader: 'tsx',
                format: 'cjs',
                jsx: 'transform',
                jsxFactory: 'React.createElement',
                jsxFragment: 'React.Fragment',
                target: 'es2020',
              })
              agentState.cardRenderer = built.code
              result = { success: true }
            } catch (buildErr) {
              result = { error: buildErr instanceof Error ? buildErr.message : 'Build failed' }
            }
          } else {
            result = { error: `Unknown tool: ${block.name}` }
          }

          sendEvent('tool_call', { name: block.name, result })
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }

        messages.push({ role: 'user', content: toolResults })
      } else {
        if (finalMessage.stop_reason === 'max_tokens') {
          throw new Error('Claude response exceeded max_tokens limit — card renderer was not generated')
        }
        continueLoop = false
      }
    }
  } catch (err) {
    fastify.log.error(err, 'Agent error')
    sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
  }

  return agentState
}

function sseHeaders(origin?: string) {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': origin ?? '*',
  }
}

function addColumn(fastify: Fastify) {
  fastify.post<{
    Params: { boardId: string }
    Body: { name: string; prompt?: string }
  }>('/boards/:boardId/columns', {
    schema: { tags: ['Boards'], summary: 'Add column (SSE)' },
  }, async (request, reply) => {
    const { boardId } = request.params
    const { name, prompt } = request.body

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const agentState = prompt?.trim() ? await runAgentLoop(fastify, prompt, sendEvent) : {}

    const column = await fastify.db.transaction(async (tx) => {
      const positionResult = await tx
        .select({ max: max(columns.position) })
        .from(columns)
        .where(eq(columns.boardId, boardId))

      const nextPosition = (positionResult[0].max ?? -1) + 1

      const [col] = await tx
        .insert(columns)
        .values({
          boardId,
          name,
          pipelineKind: 'agent',
          prompt,
          position: nextPosition,
          dataSchema: agentState.dataSchema ?? null,
          cardRenderer: agentState.cardRenderer ?? null,
        })
        .returning()

      return col
    })

    const { dataSchema: _ds, ...columnPublic } = column
    sendEvent('column', columnPublic)
    sendEvent('done', {})
    reply.raw.end()
  })
}

function runColumnAgent(fastify: Fastify) {
  fastify.get<{ Params: { columnId: string } }>('/columns/:columnId/run', {
    schema: { tags: ['Boards'], summary: 'Re-run AI agent for column (SSE)' },
  }, async (request, reply) => {
    const { columnId } = request.params

    const [column] = await fastify.db.select().from(columns).where(eq(columns.id, columnId))
    if (!column) return reply.code(404).send({ error: 'Column not found' })
    if (!column.prompt) return reply.code(400).send({ error: 'Column has no prompt' })

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const agentState = await runAgentLoop(fastify, column.prompt, sendEvent)

    await fastify.db.update(columns).set({
      dataSchema: agentState.dataSchema ?? column.dataSchema,
      cardRenderer: agentState.cardRenderer ?? column.cardRenderer,
    }).where(eq(columns.id, columnId))

    const [updated] = await fastify.db.select().from(columns).where(eq(columns.id, columnId))
    const { dataSchema: _ds, ...columnPublic } = updated
    sendEvent('column', columnPublic)
    sendEvent('done', {})
    reply.raw.end()
  })
}

function addCard(fastify: Fastify) {
  fastify.post<{
    Params: { boardId: string, columnId: string }
    Body: {
      title: string,
      description: string
    }
  }>('/columns/:columnId', {
    schema: {
      tags: ['Boards'],
      summary: 'Add card to column',
    },
  }, async (request, reply) => {
    const { columnId } = request.params

    const result = await fastify.db.transaction(async (tx) => {


      const [card] = await tx.insert(cards).values({
        title: request.body.title,
        description: request.body.description,
        columnId: columnId,
      }).returning()
      return card
    })

    return reply.code(201).send(result)
  })
}

function deleteColumn(fastify: Fastify) {
  fastify.delete<{
    Params: { columnId: string }
  }>('/columns/:columnId', {
    schema: { tags: ['Boards'], summary: 'Delete column' },
  }, async (request, reply) => {
    await fastify.db.delete(columns).where(eq(columns.id, request.params.columnId))
    return reply.code(204).send()
  })
}

function patchCardMetadata(fastify: Fastify) {
  fastify.patch<{
    Params: { cardId: string }
    Body: { patch: Record<string, unknown> }
  }>('/cards/:cardId/metadata', {
    schema: {
      tags: ['Boards'],
      summary: 'Patch card metadata for the card\'s current column (used by card renderers to persist state)',
      body: {
        type: 'object',
        properties: {
          patch: { type: 'object' },
        },
        required: ['patch'],
      },
    },
  }, async (request, reply) => {
    const { cardId } = request.params
    const { patch } = request.body

    const [card] = await fastify.db.select().from(cards).where(eq(cards.id, cardId))
    if (!card) return reply.code(404).send({ error: 'Card not found' })

    const columnId = card.columnId
    const existingData = (card.data && typeof card.data === 'object') ? card.data as Record<string, unknown> : {}
    const existingColumnData = (existingData[columnId] && typeof existingData[columnId] === 'object') ? existingData[columnId] as Record<string, unknown> : {}
    const updatedData = { ...existingData, [columnId]: { ...existingColumnData, ...patch } }

    const [updatedCard] = await fastify.db.update(cards).set({ data: updatedData }).where(eq(cards.id, cardId)).returning()
    return reply.send(updatedCard)
  })
}

function moveCard(fastify: Fastify) {
  fastify.patch<{
    Params: { cardId: string }
    Body: {
      destinationColumnId: string
    }
  }>('/cards/:cardId', {
    schema: {
      tags: ['Boards'],
      summary: 'Move card to destination column',
    },
  }, async (request, reply) => {
    const { cardId } = request.params

    // make sure this columnid is for this board

    const result = await fastify.db.transaction(async (tx) => {
      return tx.update(cards).set({
        columnId: request.body.destinationColumnId
      }).where(eq(cards.id, cardId))
    })

    return reply.code(200).send(result)
  })
}


async function runPipelineAgentLoop(
  fastify: Fastify,
  systemPrompt: string,
  card: { id: string; title: string; description: string; data: unknown; columnId: string },
  dataSchema: unknown,
  sendEvent: (event: string, data: unknown) => void
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const tools: Anthropic.Tool[] = [
    {
      name: 'set_card_data',
      description: 'Set the structured data for this card. The data must conform to the column\'s data schema.',
      input_schema: {
        type: 'object' as const,
        properties: {
          data: {
            type: 'object' as const,
            description: 'The structured data object to store on the card, matching the column\'s data schema',
          },
        },
        required: ['data'],
      },
    },
  ]

  const schemaHint = dataSchema
    ? `\n\nThe card data must conform to this JSON Schema:\n${JSON.stringify(dataSchema, null, 2)}`
    : ''

  const userMessage = `Card title: ${card.title}\nCard description: ${card.description}${schemaHint}`
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  try {
    let continueLoop = true
    while (continueLoop) {
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools,
      })

      const toolUseBlocks: Map<number, { id: string; name: string; inputJson: string }> = new Map()

      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolUseBlocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, inputJson: '' })
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            sendEvent('text', { text: event.delta.text })
          } else if (event.delta.type === 'input_json_delta') {
            const block = toolUseBlocks.get(event.index)
            if (block) block.inputJson += event.delta.partial_json
          }
        }
      }

      const finalMessage = await stream.finalMessage()

      if (finalMessage.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of toolUseBlocks.values()) {
          const input = JSON.parse(block.inputJson || '{}')
          let result: unknown

          if (block.name === 'set_card_data') {
            const existingData = (card.data && typeof card.data === 'object') ? card.data as Record<string, unknown> : {}
            const updatedData = { ...existingData, [card.columnId]: input.data }

            await fastify.db.update(cards).set({ data: updatedData }).where(eq(cards.id, card.id))

            const [updatedCard] = await fastify.db.select().from(cards).where(eq(cards.id, card.id))
            sendEvent('card', updatedCard)
            result = { success: true }
          } else {
            result = { error: `Unknown tool: ${block.name}` }
          }

          sendEvent('tool_call', { name: block.name, result })
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }

        messages.push({ role: 'user', content: toolResults })
      } else {
        continueLoop = false
      }
    }
  } catch (err) {
    fastify.log.error(err, 'Pipeline agent error')
    sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
  }
}

function runPipeline(fastify: Fastify) {
  fastify.post<{
    Body: { card_id: string }
  }>('/pipelines', {
    schema: {
      tags: ['Pipelines'],
      summary: 'Run the column pipeline agent for a card (SSE)',
      body: {
        type: 'object',
        properties: { card_id: { type: 'string' } },
        required: ['card_id'],
      },
    },
  }, async (request, reply) => {
    const { card_id } = request.body

    const [card] = await fastify.db.select().from(cards).where(eq(cards.id, card_id))
    if (!card) return reply.code(404).send({ error: 'Card not found' })

    const [column] = await fastify.db.select().from(columns).where(eq(columns.id, card.columnId))
    if (!column) return reply.code(404).send({ error: 'Column not found' })
    if (!column.prompt) return reply.code(400).send({ error: 'Column has no pipeline prompt' })

    reply.hijack()
    reply.raw.writeHead(200, sseHeaders(request.headers.origin))

    function sendEvent(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    await runPipelineAgentLoop(fastify, column.prompt, card, column.dataSchema, sendEvent)

    sendEvent('done', {})
    reply.raw.end()
  })
}

export default boards
