import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import { CreatePageInner, type ChatMessage } from './create-page'

const INTERNAL_USER_MESSAGES = new Set(['Now execute this plan and build the app.'])

function historyToChatMessages(history: unknown[]): ChatMessage[] {
  type Msg = { role: string; content: unknown }
  type Block = { type: string; text?: string; thinking?: string }

  const result: ChatMessage[] = []
  let pendingText = ''
  let pendingThinking = ''

  function flushAssistant() {
    if (pendingText || pendingThinking) {
      result.push({
        role: 'assistant',
        content: pendingText,
        thinking: pendingThinking || undefined,
        streaming: false,
      })
      pendingText = ''
      pendingThinking = ''
    }
  }

  for (const msg of history as Msg[]) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string' && !INTERNAL_USER_MESSAGES.has(msg.content)) {
        flushAssistant()
        const match = msg.content.match(/User request:\s*([\s\S]+)$/)
        const userText = match ? match[1].trim() : msg.content
        result.push({ role: 'user', content: userText })
      }
      // Array content = tool_result messages, or internal trigger messages → skip
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const blocks = msg.content as Block[]
        pendingText += blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
        pendingThinking += blocks.filter(b => b.type === 'thinking').map(b => b.thinking ?? '').join('')
      } else if (typeof msg.content === 'string') {
        pendingText += msg.content
      }
    }
  }

  flushAssistant()

  return result
}

export function EditPage() {
  const { appId } = useParams({ from: '/apps/$appId/edit' })

  const { data: app, isError } = useQuery({
    queryKey: ['edit-app', appId],
    queryFn: () => client.createDraft(appId).then(() => client.getAppForEdit(appId)),
    staleTime: Infinity,
    retry: false,
  })

  if (isError) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground font-sans">
        <p className="text-muted-foreground">Failed to load app. Please go back and try again.</p>
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
