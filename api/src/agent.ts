import Anthropic from '@anthropic-ai/sdk'
import { Model } from '@anthropic-ai/sdk/resources'

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
  onText: (delta: string) => void
  onToolCall?: (name: string, input: unknown, result: unknown) => void
}): Promise<Anthropic.MessageParam[]> {
  const {
    messages,
    tools = [],
    system,
    model = 'claude-sonnet-4-6',
    maxTokens = 16000,
    thinking,
    onText,
    onToolCall,
  } = params

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sdkTools: Anthropic.Tool[] = tools.map(({ handler: _h, ...t }) => t)

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
          onText(event.delta.text)
        } else if (event.delta.type === 'input_json_delta') {
          const block = toolUseBlocks.get(event.index)
          if (block) block.inputJson += event.delta.partial_json
        }
        // thinking_delta is intentionally ignored — internal reasoning only
      }
    }

    const finalMessage = await stream.finalMessage()
    console.log(`[agent] iteration ${iteration} done — stop_reason=${finalMessage.stop_reason} local_tool_calls=${toolUseBlocks.size}`)

    if (finalMessage.stop_reason === 'max_tokens') {
      throw new Error('Claude response exceeded max_tokens limit')
    }

    if (toolUseBlocks.size > 0) {
      // Local tool calls pending — execute them and continue the loop.
      messages.push({ role: 'assistant', content: finalMessage.content as Anthropic.ContentBlock[] })

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUseBlocks.values()) {
        const input = JSON.parse(block.inputJson || '{}') as Record<string, unknown>
        const toolDef = tools.find(t => t.name === block.name)
        let result: unknown

        if (toolDef) {
          result = await toolDef.handler(input)
        } else {
          result = { error: `Unknown tool: ${block.name}` }
        }

        console.log(`[agent]   executed local tool: ${block.name} → ${JSON.stringify(result).slice(0, 80)}`)
        onToolCall?.(block.name, input, result)
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
