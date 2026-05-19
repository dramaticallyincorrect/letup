import fp from 'fastify-plugin'
import { auth } from '../auth'
import { fromNodeHeaders } from 'better-auth/node'

declare module 'fastify' {
    interface FastifyRequest {
        userId: string | null
        userEmail: string | null
        assertAuthenticated(): string
        assertAdmin(): string
    }
}

export default fp(async (fastify) => {
    fastify.decorateRequest('userId', null)
    fastify.decorateRequest('userEmail', null)
    fastify.decorateRequest('assertAuthenticated', function (this: any) {
        if (!this.userId) throw fastify.httpErrors.unauthorized('Authentication required')
        return this.userId as string
    })
    fastify.decorateRequest('assertAdmin', function (this: any) {
        if (!this.userId) throw fastify.httpErrors.unauthorized('Authentication required')
        const adminEmail = process.env.ADMIN_EMAIL
        if (!adminEmail || this.userEmail !== adminEmail) throw fastify.httpErrors.forbidden('Admin access required')
        return this.userId as string
    })

    fastify.addHook('preHandler', async (request) => {
        const session = await auth.api
            .getSession({ headers: fromNodeHeaders(request.headers) })
            .catch(() => null)
        request.userId = session?.user?.id ?? null
        request.userEmail = session?.user?.email ?? null
    })
})