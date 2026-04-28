import { type FastifyPluginAsync } from 'fastify'
import { columns, columnCommands, boards as boardsTable } from '../db/schema'
import { eq, max } from 'drizzle-orm'

const boards: FastifyPluginAsync = async (fastify): Promise<void> => {
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

      return createdBoard[0]
    })

    return reply.code(201).send(result)
  })


  fastify.post<{
    Params: { boardId: string }
    Body: {
      name: string
      pipelineKind: 'shell' | 'agent'
      commands?: string[]
      prompt?: string
    }
  }>('/boards/:boardId/columns', {
    schema: {
      tags: ['Boards'],
      summary: 'Add column',
    },
  }, async (request, reply) => {
    const { boardId } = request.params
    const { name, pipelineKind, commands, prompt } = request.body

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
          pipelineKind,
          prompt: prompt,
          position: nextPosition,
        })
        .returning()

      if (pipelineKind === 'shell' && commands?.length) {
        await tx.insert(columnCommands).values(
          commands.map((command, i) => ({
            columnId: column.id,
            command,
            position: i,
          }))
        )
      }

      return column
    })

    return reply.code(201).send(result)
  })
}

export default boards
