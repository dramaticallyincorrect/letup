import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { AgentTool } from './agent.js'

// Resolves to workspace-root node_modules/.bin/shadcn.
// Works in both dev (tsx, __dirname = api/src/) and prod (tsc, __dirname = api/dist/).
const SHADCN_BIN = resolve(__dirname, '../../node_modules/.bin/shadcn')

export interface ShadcnMcpHandle {
  tools: AgentTool[]
  close: () => Promise<void>
}

export async function createShadcnMcpTools(): Promise<ShadcnMcpHandle> {
  const transport = new StdioClientTransport({
    command: SHADCN_BIN,
    args: ['mcp'],
    stderr: 'pipe',
  })

  const client = new Client(
    { name: 'app-builder', version: '1.0.0' },
    { capabilities: {} },
  )

  await client.connect(transport)

  const { tools: mcpTools } = await client.listTools()

  const agentTools: AgentTool[] = mcpTools.map(mcpTool => ({
    name: mcpTool.name,
    description: mcpTool.description ?? '',
    input_schema: mcpTool.inputSchema as AgentTool['input_schema'],
    handler: async (input: Record<string, unknown>): Promise<unknown> => {
      const result = await client.callTool({ name: mcpTool.name, arguments: input })
      if ('content' in result && Array.isArray(result.content)) {
        const textParts = result.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
        return textParts.length > 0 ? textParts.join('\n') : result.content
      }
      return result
    },
  }))

  console.log(`[shadcnMcp] ready — tools: [${agentTools.map(t => t.name).join(', ')}]`)

  return {
    tools: agentTools,
    close: async () => { try { await client.close() } catch { /* best-effort */ } },
  }
}
