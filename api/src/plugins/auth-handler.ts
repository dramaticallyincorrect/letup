import fp from 'fastify-plugin'
import { auth } from '../auth'

export default fp(async (fastify) => {
  fastify.all('/api/auth/*', async (request, reply) => {
    const origin = request.headers.origin
    const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    // Set CORS headers directly — reply.hijack() skips @fastify/cors entirely
    if (origin === allowedOrigin) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Access-Control-Allow-Credentials', 'true')
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Cookie')
    }

    if (request.method === 'OPTIONS') {
      return reply.code(204).send()
    }

    // Fastify has already consumed and parsed the body stream, so toNodeHandler
    // would receive an empty body. Instead, build a Web API Request manually
    // using the already-parsed body so better-auth can read it correctly.
    const url = new URL(request.url, `http://${request.headers.host}`)
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body != null
    const webRequest = new Request(url, {
      method: request.method,
      headers: Object.entries(request.headers).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value.join(',') : (value ?? '')
        return acc
      }, {}),
      body: hasBody ? JSON.stringify(request.body) : undefined,
    })

    const response = await auth.handler(webRequest)

    reply.code(response.status)
    response.headers.forEach((value, key) => reply.header(key, value))
    const body = await response.text()
    return reply.send(body)
  })
})