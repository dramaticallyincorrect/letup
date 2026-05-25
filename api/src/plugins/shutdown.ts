import fp from 'fastify-plugin'
import type { FastifyBaseLogger } from 'fastify'

class BuildRegistry {
  private builds = new Set<AbortController>()
  private idle: Promise<void> = Promise.resolve()
  private idleResolve: () => void = () => { }

  register(ac: AbortController) {
    if (this.builds.size === 0) {
      this.idle = new Promise<void>(resolve => { this.idleResolve = resolve })
    }
    this.builds.add(ac)
  }

  unregister(ac: AbortController) {
    if (!this.builds.delete(ac)) return
    if (this.builds.size === 0) this.idleResolve()
  }

  abortAll() {
    for (const ac of this.builds) {
      if (!ac.signal.aborted) ac.abort()
    }
  }

  get count(): number {
    return this.builds.size
  }

  whenIdle(): Promise<void> {
    return this.builds.size === 0 ? Promise.resolve() : this.idle
  }
}

export const buildRegistry = new BuildRegistry()

const state = { isShuttingDown: false }

export function isShuttingDown(): boolean {
  return state.isShuttingDown
}

export function beginShutdown(log: FastifyBaseLogger): void {
  if (state.isShuttingDown) return
  state.isShuttingDown = true
  log.info({ activeBuilds: buildRegistry.count }, 'server entering draining mode')
}

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!state.isShuttingDown) return
    if (request.method === 'POST' && request.routeOptions.url === '/apps/build') {
      reply.code(503).send({ error: 'server_draining' })
    }
  })
})
