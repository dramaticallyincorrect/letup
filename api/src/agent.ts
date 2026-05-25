import Anthropic from '@anthropic-ai/sdk'
import { Model, OutputConfig } from '@anthropic-ai/sdk/resources'

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export class PauseForQuestionError extends Error {
  constructor(public readonly questionId: string) {
    super('PauseForQuestion')
    this.name = 'PauseForQuestionError'
  }
}
const deepseekClient = new Anthropic({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/anthropic',
})

export function clientFor(model: string): Anthropic {
  return model.startsWith('deepseek') ? deepseekClient : anthropicClient
}

export type AgentTool = Anthropic.Tool & {
  handler: (input: Record<string, unknown>) => Promise<unknown>
}

// Pass a plain string or a cacheable array (for prompt caching).
export type SystemPrompt =
  | string
  | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>

/**
 * Wraps a plain string system prompt into the cacheable array format.
 */
export function cached(text: string): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
}

/**
 * Adds cache_control: { type: 'ephemeral' } to the last content block of the
 * last message. Use this to mark prior conversation context as cacheable before
 * appending a new user turn (e.g. refinement history loaded from DB).
 */
export function markLastTurnCacheable(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages
  const result = [...messages]
  const last = { ...result[result.length - 1] }
  if (typeof last.content === 'string') {
    last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }]
  } else if (Array.isArray(last.content) && last.content.length > 0) {
    const blocks = [...last.content]
    // Thinking blocks cannot have cache_control — find the last non-thinking block
    let idx = blocks.length - 1
    while (idx >= 0) {
      const t = (blocks[idx] as unknown as Record<string, unknown>).type
      if (t !== 'thinking' && t !== 'redacted_thinking') break
      idx--
    }
    if (idx >= 0) {
      blocks[idx] = { ...blocks[idx], cache_control: { type: 'ephemeral' } } as typeof blocks[0]
      last.content = blocks
    }
  }
  result[result.length - 1] = last
  return result
}

export function stripCacheControl(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') return msg
    const content = (msg.content as unknown as Array<Record<string, unknown>>).map(block => {
      if ('cache_control' in block) {
        const { cache_control: _cc, ...rest } = block
        return rest
      }
      return block
    })
    return { ...msg, content } as unknown as Anthropic.MessageParam
  })
}

/**
 * Runs an agentic loop using the Anthropic SDK.
 * Supports prompt caching (pass system as array via `cached()`),
 * extended thinking, and optional tools.
 * Returns the final messages array.
 */
export async function runAgentLoop(params: {
  messages: Anthropic.MessageParam[]
  tools?: AgentTool[]
  system: SystemPrompt
  model?: Model,
  effort: OutputConfig['effort']
  maxTokens?: number
  onText?: (delta: string) => void
  onThinking?: (delta: string) => void
  onToolCall?: (name: string, input: unknown, result: unknown) => void
  onUsage?: (usage: Anthropic.Usage, model: string, durationSeconds: number) => void | Promise<void>
  signal?: AbortSignal
}): Promise<Anthropic.MessageParam[]> {
  const {
    messages,
    tools = [],
    system,
    model = 'claude-sonnet-4-6',
    effort = 'medium',
    onText,
    onThinking,
    onToolCall,
    onUsage,
    signal,
  } = params

  function throwIfAborted() {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    }
  }

  const sdkTools: Anthropic.Tool[] = tools.map(({ handler: _h, ...t }) => t)

  // Cache the last tool definition so all tool schemas are cached together.
  if (sdkTools.length > 0) {
    sdkTools[sdkTools.length - 1] = {
      ...sdkTools[sdkTools.length - 1],
      cache_control: { type: 'ephemeral' },
    } as Anthropic.Tool
  }

  let continueLoop = true
  let iteration = 0
  while (continueLoop) {
    throwIfAborted()
    iteration++

    const baseParams = {
      model,
      system: system as Anthropic.MessageStreamParams['system'],
      tools: sdkTools.length > 0 ? sdkTools : undefined,
      messages: markLastTurnCacheable(stripCacheControl(messages)),
    }

    const iterStart = Date.now()
    const stream = clientFor(model).messages.stream({
      max_tokens: 20_000,
      ...baseParams,
      thinking: {
        type: 'adaptive',
      }, output_config: {
        effort: effort
      }
    }, { signal })

    const onAbort = () => {
      try { stream.abort() } catch { /* noop */ }
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    const toolUseBlocks = new Map<number, { id: string; name: string; inputJson: string }>()
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const type = event.content_block.type
        if (type === 'tool_use') {
          toolUseBlocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          onText?.(event.delta.text)
        } else if (event.delta.type === 'thinking_delta') {
          onThinking?.(event.delta.thinking)
        } else if (event.delta.type === 'input_json_delta') {
          const block = toolUseBlocks.get(event.index)
          if (block) block.inputJson += event.delta.partial_json
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    signal?.removeEventListener('abort', onAbort)
    const durationSeconds = (Date.now() - iterStart) / 1000
    await onUsage?.(finalMessage.usage, model, durationSeconds)

    if (finalMessage.stop_reason === 'max_tokens') {
      messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })
      messages.push({ role: 'user', content: [{ type: 'text', text: 'You reached the maximum number of tokens, stop thinking and start the implementation' }] })
      continue;
    }

    messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })

    if (toolUseBlocks.size > 0) {
      const toolResults = await Promise.all(
        [...toolUseBlocks.values()].map(async block => {
          const input = JSON.parse(block.inputJson || '{}') as Record<string, unknown>
          const toolDef = tools.find(t => t.name === block.name)
          let result: unknown

          if (toolDef) {
            onToolCall?.(block.name, input, null)
            result = await toolDef.handler(input)
          } else {
            result = { error: `Unknown tool: ${block.name}, availble tools are ${sdkTools.map((t) => t.name + ' ,')}` }
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          } satisfies Anthropic.ToolResultBlockParam
        })
      )

      messages.push({ role: 'user', content: toolResults })
      throwIfAborted()
    } else {
      continueLoop = false
    }
  }
  return messages
}
