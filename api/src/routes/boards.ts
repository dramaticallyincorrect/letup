import { FastifyBaseLogger, FastifyInstance, FastifyTypeProviderDefault, RawServerDefault, type FastifyPluginAsync } from 'fastify'
import { columns, boards as boardsTable, cards } from '../db/schema'
import { eq, max, asc } from 'drizzle-orm'
import { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'


type Fastify = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>

const boards: FastifyPluginAsync = async (fastify): Promise<void> => {

  getAllBoards(fastify)

  addBoard(fastify)
  getBoard(fastify)
  deleteBoard(fastify)

  addColumn(fastify)
  runColumnAgent(fastify)
  addCard(fastify)
  moveCard(fastify)
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
      columns: boardColumns.map((col, i) => ({
        ...col,
        cards: allCards[i] ?? [],
      })),
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

async function runAgentLoop(
  fastify: Fastify,
  prompt: string,
  sendEvent: (event: string, data: unknown) => void
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const tools: Anthropic.Tool[] = [
    {
      name: 'set_name',
      description: 'Set the column name',
      input_schema: {
        type: 'object' as const,
        properties: { name: { type: 'string', description: 'The new column name' } },
        required: ['name'],
      },
    },
  ]

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  try {
    let continueLoop = true
    while (continueLoop) {
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: 'You are an agent that configures Kanban board columns. The user will describe what kind of column they want. Use the available tools to set the column\'s properties appropriately.',
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

          if (block.name === 'set_name') {
            fastify.log.info({ name: input.name }, 'set_name tool called (dummy)')
            result = { success: true, name: input.name }
          } else {
            result = { error: `Unknown tool: ${block.name}` }
          }

          sendEvent('tool_call', { name: block.name, input, result })
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }

        messages.push({ role: 'user', content: toolResults })
      } else {
        continueLoop = false
      }
    }
  } catch (err) {
    fastify.log.error(err, 'Agent error')
    sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' })
  }
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

    if (prompt?.trim()) {
      await runAgentLoop(fastify, prompt, sendEvent)
    }

    const column = await fastify.db.transaction(async (tx) => {
      const positionResult = await tx
        .select({ max: max(columns.position) })
        .from(columns)
        .where(eq(columns.boardId, boardId))

      const nextPosition = (positionResult[0].max ?? -1) + 1

      const [col] = await tx
        .insert(columns)
        .values({ boardId, name, pipelineKind: 'agent', prompt, position: nextPosition })
        .returning()

      return col
    })

    sendEvent('column', column)
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

    await runAgentLoop(fastify, column.prompt, sendEvent)
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


export default boards
