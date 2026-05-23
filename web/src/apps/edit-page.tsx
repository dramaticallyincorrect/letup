import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import { CreatePageInner, type ChatMessage } from './create-page'

function displayToChat(display: client.DisplayMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  for (const m of display) {
    if (m.role === 'user') {
      result.push(m)
    } else if (m.role === 'assistant') {
      result.push({ role: 'assistant', content: m.content, streaming: false })
    } else if (m.role === 'question') {
      result.push({ role: 'question', questionId: m.questionId, question: m.question, suggestions: m.suggestions, answered: m.answer !== undefined })
      if (m.answer) result.push({ role: 'user', content: m.answer })
    }
  }
  return result
}

export function EditPage() {
  const { appId } = useParams({ from: '/protected/apps/$appId/edit' })

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
      initialMessages={displayToChat(app.displayHistory)}
      initialCompiledCode={app.compiledCode}
      initialCssCode={app.cssCode}
    />
  )
}
