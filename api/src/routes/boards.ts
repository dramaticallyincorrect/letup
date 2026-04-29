import { FastifyBaseLogger, FastifyInstance, FastifyTypeProviderDefault, RawServerDefault, type FastifyPluginAsync } from 'fastify'
import { columns, boards as boardsTable, cards } from '../db/schema'
import { eq, max, asc } from 'drizzle-orm'
import { IncomingMessage, ServerResponse } from 'node:http'


type Fastify = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>

const boards: FastifyPluginAsync = async (fastify): Promise<void> => {

  getAllBoards(fastify)

  addBoard(fastify)
  getBoard(fastify)
  deleteBoard(fastify)

  addColumn(fastify)
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

function addColumn(fastify: Fastify) {
  fastify.post<{
    Params: { boardId: string }
    Body: {
      name: string
      prompt: string
    }
  }>('/boards/:boardId/columns', {
    schema: {
      tags: ['Boards'],
      summary: 'Add column',
    },
  }, async (request, reply) => {
    const { boardId } = request.params
    const { name, prompt } = request.body

    const result = await fastify.db.transaction(async (tx) => {
      const positionResult = await tx
        .select({ max: max(columns.position) })
        .from(columns)
        .where(eq(columns.boardId, boardId))

      const nextPosition = (positionResult[0].max ?? -1) + 1

      const [column] = await tx
        .insert(columns)
        .values({
          boardId,
          name,
          pipelineKind: 'agent',
          prompt: prompt,
          position: nextPosition,
        })
        .returning()      

      return column
    })

    return reply.code(201).send(result)
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
