import Fastify from 'fastify'
import app from './app'

const isDev = process.env.NODE_ENV !== 'production'

const server = Fastify({
  logger: isDev
    ? { transport: { target: 'pino-pretty' } }
    : true,
})

server.register(app)

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
