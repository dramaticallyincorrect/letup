import { vi } from 'vitest'
import Fastify, { type FastifyPluginAsync } from 'fastify'
import type { TestContext } from 'vitest'

async function build(t: Pick<TestContext, 'onTestFinished'>) {
  // Fresh module state for each build() call so the db mock applies cleanly
  vi.resetModules()

  const { createTestDb } = await import('./testDb.js')
  const { client, db } = await createTestDb()

  // Mock src/db before loading the app so all plugins get the in-memory db
  vi.doMock('../src/db', () => ({ db }))

  const { default: appPlugin } = await import('../src/app.js') as unknown as { default: FastifyPluginAsync }

  const app = Fastify({ logger: false })
  await app.register(appPlugin)
  await app.ready()

  t.onTestFinished(async () => {
    await app.close()
    await client.close()
  })

  return { app, db }
}

export { build }
