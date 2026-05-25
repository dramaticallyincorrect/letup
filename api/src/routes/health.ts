import { FastifyPluginAsync } from 'fastify'
import { Fastify } from '../fastify_type'
import { buildRegistry, isShuttingDown } from '../plugins/shutdown'

const healthPlugin: FastifyPluginAsync = async (fastify) => {
  health(fastify)
}

function health(fastify: Fastify) {
  fastify.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Liveness/drain probe',
    },
  }, async (_request, reply) => {
    if (isShuttingDown()) {
      return reply.code(503).send({
        status: 'shutting_down',
        activeBuilds: buildRegistry.count,
      })
    }
    return reply.send({ status: 'ok' })
  })
}

export default healthPlugin
