import { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import * as client from '@repo/data'
import { CreatePageInner, type ChatMessage } from './create-page'

function historyToChatMessages(history: unknown[]): ChatMessage[] {
  type Msg = { role: string; content: unknown }
  type Block = { type: string; text?: string; thinking?: string }

  const result: ChatMessage[] = []
  let pendingAssistantText = ''

  for (const msg of history as Msg[]) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        // Round-trip boundary: flush accumulated assistant text first
        if (pendingAssistantText) {
          result.push({ role: 'assistant', content: pendingAssistantText, streaming: false })
          pendingAssistantText = ''
        }
        // Extract the original user message from the synthetic build message
        const match = msg.content.match(/User request:\s*([\s\S]+)$/)
        const userText = match ? match[1].trim() : msg.content
        result.push({ role: 'user', content: userText })
      }
      // Array content = tool_result messages → skip
    } else if (msg.role === 'assistant') {
      const text = Array.isArray(msg.content)
        ? (msg.content as Block[]).filter(b => b.type === 'text' || b.type == 'thinking').map(b => b.text ?? b.thinking ?? '').join('')
        : typeof msg.content === 'string' ? msg.content : ''
      if (text) pendingAssistantText += text
    }
  }

  if (pendingAssistantText) {
    result.push({ role: 'assistant', content: pendingAssistantText, streaming: false })
  }

  return result
}

export function EditPage() {
  const { appId } = useParams({ from: '/apps/$appId/edit' })
  const [app, setApp] = useState<client.AppDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.getAppForEdit(appId)
      .then(setApp)
      .catch(() => setError('Failed to load app. Please go back and try again.'))
  }, [appId])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground font-sans">
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground font-sans">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <CreatePageInner
      key={app.id}
      initialWidgetId={app.id}
      initialAppName={app.name}
      initialMessages={historyToChatMessages(app.conversationHistory)}
      initialCompiledCode={app.compiledCode}
      initialCssCode={app.cssCode}
    />
  )
}
