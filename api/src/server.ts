import { join } from 'node:path'
import { config } from 'dotenv'

// Must load env vars before importing anything that uses process.env.
// esbuild/tsx hoists all static `import` statements to the top of each
// file, so dotenv.config() in app.ts runs *after* db/index.ts has
// already created its postgres connection. Loading here first and then
// using dynamic import() for the app ensures the right order.
config({ path: join(__dirname, '../.env') })
config({ path: join(__dirname, '../.env.local'), override: true })

async function start() {
  const { default: Fastify } = await import('fastify')
  const { app } = await import('./app.js')

  const isDev = process.env.NODE_ENV !== 'production'

  const server = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty' } }
      : true,
    disableRequestLogging: !isDev,
  })

  server.register(app)

  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
