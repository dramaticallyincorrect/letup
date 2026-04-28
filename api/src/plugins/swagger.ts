import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'

export default fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: { title: 'API', version: '1.0.0' },
    },
  })

  await fastify.register(scalar, {
    routePrefix: '/docs',
  })
})
