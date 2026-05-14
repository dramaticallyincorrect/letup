import { FastifyPluginAsync } from "fastify";
import { Fastify } from "../fastify_type";
import Anthropic from "@anthropic-ai/sdk";
import { hasCredits, checkAndDeductCredits, logUsage, tokensToMicroUnits, InsufficientCreditsError } from "../credits";

const aiRoute: FastifyPluginAsync = async (fastify) => {
    generateAi(fastify)
}

function generateAi(fastify: Fastify) {
    fastify.post<{ Body: { prompt: string; system?: string; model?: string } }>('/ai/generate', {
        schema: {
            tags: ['ai'],
            summary: 'Generate text via ai',
            body: {
                type: 'object',
                properties: {
                    prompt: { type: 'string' },
                    system: { type: 'string' },
                    model: { type: 'string' },
                },
                required: ['prompt'],
            },
        },
    }, async (request, reply) => {
        const { prompt, system, model = 'claude-haiku-4-5' } = request.body
        const userId = request.assertAuthenticated()

        if (!(await hasCredits(fastify.db, userId))) {
            return reply.code(402).send({ error: 'Insufficient credits' })
        }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const message = await client.messages.create({
            model,
            max_tokens: 1024,
            ...(system ? { system } : {}),
            messages: [{ role: 'user', content: prompt }],
        })

        const mu = tokensToMicroUnits(message.usage, model)
        try {
            await checkAndDeductCredits(fastify.db, userId, mu)
        } catch (err) {
            if (err instanceof InsufficientCreditsError) {
                return reply.code(402).send({ error: 'Insufficient credits' })
            }
            throw err
        }
        await logUsage(fastify.db, userId, 'ai-endpoint', model, message.usage, mu)

        const text = message.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
        return reply.send({ text })
    })
}

export default aiRoute
