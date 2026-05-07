import Anthropic from '@anthropic-ai/sdk'
import { Model } from '@anthropic-ai/sdk/resources'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
      const t = (blocks[idx] as Record<string, unknown>).type
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
  model?: Model
  maxTokens?: number
  /** Enable extended thinking. budget_tokens must be < maxTokens. */
  thinking?: { budget_tokens: number }
  onText?: (delta: string) => void
  onThinking?: (delta: string) => void
  onToolCall?: (name: string, input: unknown, result: unknown) => void
  onUsage?: (usage: Anthropic.Usage, model: string) => void | Promise<void>
}): Promise<Anthropic.MessageParam[]> {
  const {
    messages,
    tools = [],
    system,
    model = 'claude-sonnet-4-6',
    maxTokens = 16000,
    thinking,
    onText,
    onThinking,
    onToolCall,
    onUsage,
  } = params

  const sdkTools: Anthropic.Tool[] = tools.map(({ handler: _h, ...t }) => t)

  // Cache the last tool definition so all tool schemas are cached together.
  if (sdkTools.length > 0) {
    sdkTools[sdkTools.length - 1] = {
      ...sdkTools[sdkTools.length - 1],
      cache_control: { type: 'ephemeral' },
    } as Anthropic.Tool
  }

  console.log(`[agent] starting loop — model=${model} tools=[${tools.map(t => t.name).join(',')}]`)

  let continueLoop = true
  let iteration = 0
  while (continueLoop) {
    iteration++
    console.log(`[agent] iteration ${iteration} — sending request`)

    const baseParams = {
      model,
      max_tokens: maxTokens,
      system: system as Anthropic.MessageStreamParams['system'],
      tools: sdkTools.length > 0 ? sdkTools : undefined,
      messages,
      ...(thinking
        ? { thinking: { type: 'enabled' as const, budget_tokens: thinking.budget_tokens } }
        : {}),
    }

    const stream = anthropic.messages.stream(baseParams)

    const toolUseBlocks = new Map<number, { id: string; name: string; inputJson: string }>()

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const type = event.content_block.type
        if (type === 'tool_use') {
          console.log(`[agent]   tool_use: ${event.content_block.name}`)
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
    console.log(`[agent] iteration ${iteration} done — stop_reason=${finalMessage.stop_reason} local_tool_calls=${toolUseBlocks.size}`)
    await onUsage?.(finalMessage.usage, model)

    if (finalMessage.stop_reason === 'max_tokens') {
      throw new Error('Claude response exceeded max_tokens limit')
    }

    messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })

    if (toolUseBlocks.size > 0) {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUseBlocks.values()) {
        const input = JSON.parse(block.inputJson || '{}') as Record<string, unknown>
        const toolDef = tools.find(t => t.name === block.name)
        let result: unknown

        if (toolDef) {
          onToolCall?.(block.name, input, result)
          result = await toolDef.handler(input)
        } else {
          result = { error: `Unknown tool: ${block.name}, availble tools are ${sdkTools.map((t) => t.name + ' ,')}` }
        }

        console.log(`[agent]   executed local tool: ${block.name}`)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }

      messages.push({ role: 'user', content: toolResults })
    } else {
      continueLoop = false
    }
  }

  console.log(`[agent] loop complete after ${iteration} iteration(s)`)

  return messages
}
