import { FastifyPluginAsync } from "fastify";
import { Fastify } from "../fastify_type";
import Anthropic from "@anthropic-ai/sdk";

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
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const message = await client.messages.create({
            model,
            max_tokens: 1024,
            ...(system ? { system } : {}),
            messages: [{ role: 'user', content: prompt }],
        })
        const text = message.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
        return reply.send({ text })
    })
}

export default aiRoute