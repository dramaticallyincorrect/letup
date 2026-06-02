import { join } from 'node:path'
import { config } from 'dotenv'

// Must load env vars before importing anything that uses process.env.
// esbuild/tsx hoists all static `import` statements to the top of each
// file, so dotenv.config() in app.ts runs *after* db/index.ts has
// already created its postgres connection. Loading here first and then
// using dynamic import() for the app ensures the right order.
config({ path: join(__dirname, '../.env') })
config({ path: join(__dirname, '../.env.local'), override: true })

const DRAIN_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const POST_ABORT_CLEANUP_MS = 10_000

async function start() {
  const { default: Fastify } = await import('fastify')
  const { app } = await import('./app.js')
  const { buildRegistry, beginShutdown } = await import('./plugins/shutdown.js')

  const isDev = process.env.ENABLE_LOGGING === 'true' && process.env.NODE_ENV !== 'production'

  const server = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty' } }
      : true,
  })

  server.register(app)

  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }

  async function shutdown(signal: NodeJS.Signals) {
    server.log.info({ signal, activeBuilds: buildRegistry.count }, 'shutdown begin')
    beginShutdown(server.log)

    const drained = await Promise.race([
      buildRegistry.whenIdle().then(() => 'idle' as const),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), DRAIN_TIMEOUT_MS)),
    ])

    if (drained === 'timeout') {
      server.log.warn({ activeBuilds: buildRegistry.count }, 'drain timeout — aborting in-flight builds')
      buildRegistry.abortAll()
      await Promise.race([
        buildRegistry.whenIdle(),
        new Promise(resolve => setTimeout(resolve, POST_ABORT_CLEANUP_MS)),
      ])
    }

    try {
      await server.close()
    } catch (err) {
      server.log.error(err, 'error closing server')
    }
    process.exit(0)
  }

  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  process.once('SIGINT', () => { void shutdown('SIGINT') })
}

start()
