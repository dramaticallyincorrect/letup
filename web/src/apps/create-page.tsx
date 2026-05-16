import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as client from '@repo/data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Alert } from '@/components/ui/alert'
import { AppIcon } from './components/app-icon'
import { AppPreview } from './app-preview'
import { getAppGlyph, getAppTint } from './data'
import { SendHorizonal, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ErrorBoundary } from 'react-error-boundary'

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; thinking?: string; streaming: boolean }
  | { role: 'question'; questionId: string; question: string; suggestions: string[]; answered: boolean }
  | { role: 'step'; label: string }
  | { role: 'phase'; name: string; status: 'building' | 'done' }

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'str_replace': {
      const filename = ((input.path as string) ?? '').split('/').pop() || 'file'
      return `Editing ${filename}`
    }
    case 'read_file': {
      const filename = ((input.path as string) ?? '').split('/').pop() || 'file'
      return `Reading ${filename}`
    }
    case 'list_files': return 'Checking project files'
    case 'setup_database': return 'Setting up database'
    case 'set_app_metadata': return 'Naming the app'
    case 'ask_user': return 'Preparing question'
    case 'set_build_stages': return 'Defining stages'
    case 'set_build_phases': return 'Defining build phases'
    default: return 'Working…'
  }
}

function ChatComposer({
  isSending,
  currentActivity,
  hasMessages,
  onSend,
}: {
  isSending: boolean
  currentActivity: string | null
  hasMessages: boolean
  onSend: (text: string) => void
}) {
  const [inputValue, setInputValue] = useState('')

  function submit() {
    if (!inputValue.trim() || isSending) return
    onSend(inputValue)
    setInputValue('')
  }

  return (
    <div className="px-5 py-4 pb-5 border-border bg-card shrink-0">
      {currentActivity && (
        <div
          key={currentActivity}
          className="mb-2.5 flex items-center gap-2 text-[12px] text-muted-foreground animate-activity-in"
        >
          <span className="size-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
          <span className="truncate">{currentActivity}</span>
        </div>
      )}
      <div className="bg-card border-[1.5px] border-input rounded-2xl px-4 pt-3.5 pb-3">
        <Textarea
          rows={1}
          placeholder={hasMessages ? 'Ask Claude to change something…' : 'Describe your app…'}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.metaKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={isSending}
          className="min-h-7 max-h-40 border-0 resize-none font-sans border-none focus:border-0 focus-visible:ring-0"
        />
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex-1"></div>
          <Button
            size='sm'
            disabled={!inputValue.trim() || isSending}
            onClick={submit}
          >
            <SendHorizonal />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CreatePage() {
  return <CreatePageInner />
}

type CreatePageInnerProps = {
  initialWidgetId?: string
  initialAppName?: string
  initialMessages?: ChatMessage[]
  initialCompiledCode?: string | null
  initialCssCode?: string | null
}

export function CreatePageInner({
  initialWidgetId,
  initialAppName = 'Untitled app',
  initialMessages = [],
  initialCompiledCode = null,
  initialCssCode = null,
}: CreatePageInnerProps = {}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [widgetId, setWidgetId] = useState<string | null>(initialWidgetId ?? null)
  const [appName, setAppName] = useState(initialAppName)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [compiledCode, setCompiledCode] = useState<string | null>(initialCompiledCode)
  const [cssCode, setCssCode] = useState<string | null>(initialCssCode)
  const [isSending, setIsSending] = useState(false)
  const [currentActivity, setCurrentActivity] = useState<string | null>(null)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const [initError, setInitError] = useState<string | null>(null)
  const [lowCreditsBalance, setLowCreditsBalance] = useState<number | null>(null)

  const { data: billing } = useQuery({
    queryKey: ['billing-status'],
    queryFn: client.getBillingStatus,
    retry: false,
  })
  const effectiveCredits =
    lowCreditsBalance !== null ? lowCreditsBalance : billing?.credits ?? null
  const lowCredits = effectiveCredits !== null && effectiveCredits <= 5
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log('Messages updated:', messages)
  }, [messages])

  const status = isSending ? 'thinking' : compiledCode ? 'ready' : 'draft'
  const statusLabel = isSending ? 'Thinking…' : compiledCode ? 'Ready' : 'Draft'

  const currentTint = widgetId ? getAppTint(widgetId) : 'graphite'
  const currentGlyph = getAppGlyph(appName)

  async function handleSend(text: string) {
    const msg = text.trimEnd().trimStart()
    if (!msg || isSending) return

    setIsSending(true)

    let activeWidgetId = widgetId
    if (!activeWidgetId) {
      try {
        const w = await client.createApp('Untitled app')
        activeWidgetId = w.id
        setWidgetId(w.id)
      } catch {
        setInitError('Failed to create app session. Please refresh and try again.')
        setIsSending(false)
        return
      }
    }

    setMessages(prev => [
      ...prev,
      { role: 'user', content: msg },
      { role: 'assistant', content: '', streaming: true },
    ])

    try {
      const res = await client.buildApp(activeWidgetId, msg)
      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)

      const reader = res.body.getReader()
      for await (const { event, data } of client.parseSSE(reader)) {
        if (event === 'thinking') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                thinking: (last.thinking ?? '') + (data as { text: string }).text,
              }
            } else {
              next.push({ role: 'assistant', content: '', streaming: true, thinking: (data as { text: string }).text })
            }
            return next
          })
        } else if (event === 'text') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content + (data as { text: string }).text,
              }
            } else {
              next.push({ role: 'assistant', content: (data as { text: string }).text, streaming: true })
            }
            return next
          })
        } else if (event === 'tool_call') {
          const { name, input } = data as { name: string; input: Record<string, unknown> }
          setCurrentActivity(toolLabel(name, input))
        } else if (event === 'widget') {
          const w = data as client.App
          setCompiledCode(w.compiledCode)
          setCssCode(w.cssCode)
          if (w.name && w.name !== 'Untitled app' && w.name !== 'Untitled Widget') {
            setAppName(w.name)
          }
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return next
          })
        } else if (event === 'user_question') {
          const { questionId, question, suggestions } = data as { questionId: string; question: string; suggestions?: string[] }
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return [
              ...next,
              { role: 'question', questionId, question, suggestions: suggestions ?? [], answered: false },
            ]
          })
        } else if (event === 'step_start') {
          const { label } = data as { step: number; label: string }
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming && !last.content) {
              next.pop()
            } else if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return [...next, { role: 'step', label }]
          })
        } else if (event === 'phase_start') {
          const { name } = data as { name: string; index: number; total: number }
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && !last.content && !last.thinking) {
              next.pop()
            } else if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return [...next, { role: 'phase', name, status: 'building' }]
          })
        } else if (event === 'phase_complete') {
          const { name } = data as { name: string; index: number }
          setMessages(prev =>
            prev.map(m => m.role === 'phase' && m.name === name && m.status === 'building'
              ? { ...m, status: 'done' as const }
              : m
            )
          )
        } else if (event === 'low_credits') {
          const { credits } = data as { credits: number }
          setLowCreditsBalance(credits)
        } else if (event === 'error') {
          queryClient.invalidateQueries({ queryKey: ['billing-status'] })
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: (data as { message: string }).message,
                streaming: false,
              }
            }
            return next
          })
        } else if (event === 'done') {
          queryClient.invalidateQueries({ queryKey: ['billing-status'] })
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false }
            }
            return next
          })
        }
      }
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['billing-status'] })
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            content: err instanceof Error ? err.message : 'Something went wrong',
            streaming: false,
          }
        }
        return next
      })
    }

    setCurrentActivity(null)
    setIsSending(false)
  }

  async function handleAnswerQuestion(questionId: string, directAnswer?: string) {
    const answer = (directAnswer ?? questionAnswers[questionId] ?? '').trim()
    if (!answer) return
    setQuestionAnswers(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    setMessages(prev => [
      ...prev.map(m =>
        m.role === 'question' && m.questionId === questionId ? { ...m, answered: true } : m,
      ),
      { role: 'user' as const, content: answer },
      { role: 'assistant' as const, content: '', streaming: true },
    ])
    await client.answerAppQuestion(questionId, answer)
  }

  async function handleSave() {
    if (!widgetId || !compiledCode) return
    await client.patchApp(widgetId, { name: appName })
    await client.installApp(widgetId)
    navigate({ to: '/' })
  }

  if (initError) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground font-sans">
        <p className="text-muted-foreground">{initError}</p>
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground font-sans antialiased flex flex-col h-screen">
      <ResizablePanelGroup orientation="horizontal" >
        {/* Chat pane */}
        <ResizablePanel defaultSize='30%' minSize='15%' className="flex flex-col min-h-0 bg-card">
          {/* Chat header */}
          <div className="px-6 py-4 border-b border-border flex items-center gap-3.5 bg-card shrink-0">
            <AppIcon tint={currentTint} glyph={currentGlyph} size="sm" />
            <input
              className="text-base font-bold bg-transparent border-0 px-2 py-1 -mx-2 rounded-lg text-foreground font-sans outline-none w-65 tracking-[-0.01em] hover:bg-secondary focus:bg-secondary transition-colors"
              value={appName}
              onChange={e => setAppName(e.target.value)}
            />
            <div className="flex-1" />
            <span className="text-[12.5px] font-medium text-muted-foreground inline-flex items-center gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  status === 'ready' && 'bg-[oklch(0.7_0.15_145)] shadow-[0_0_0_4px_oklch(0.7_0.15_145/0.18)]',
                  status === 'thinking' && 'bg-[oklch(0.78_0.16_80)] shadow-[0_0_0_4px_oklch(0.78_0.16_80/0.22)]',
                  status === 'draft' && 'bg-muted-foreground/40',
                )}
              />
              {statusLabel}
              <Button size="sm" disabled={!compiledCode} onClick={handleSave}>
                Add to library
              </Button>
            </span>
          </div>

          {/* Chat scroll */}
          <div className="flex-1 overflow-y-auto px-7 py-7 flex flex-col gap-5.5" ref={scrollRef}>
            {messages.length === 0 && (
              <div>
                <div className="flex gap-3.5 max-w-full">
                  <div className="size-7.5 rounded-[9px] shrink-0 grid place-items-center text-xs font-bold bg-accent text-accent-foreground">
                    C
                  </div>
                  <div className="flex-1 text-[15px] leading-[1.55] text-foreground pt-1">
                    <div className="text-[12.5px] text-muted-foreground font-semibold mb-1">Claude</div>
                    <p className="m-0">
                      What should we build? Describe it — I'll draft something and we can shape it together.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="flex gap-3.5 max-w-full">
                    <div className="size-7.5 rounded-[9px] shrink-0 grid place-items-center text-xs font-bold bg-foreground text-background">
                      You
                    </div>
                    <div className="flex-1 text-[15px] leading-[1.55] text-foreground pt-1">
                      <div className="text-[12.5px] text-muted-foreground font-bold mb-1">You</div>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                )
              }
              if (m.role === 'assistant') {
                return (
                  <div key={i} className="flex gap-3.5 max-w-full">
                    <div className="size-7.5 rounded-[9px] shrink-0 grid place-items-center text-xs font-bold bg-accent text-accent-foreground">
                      C
                    </div>
                    <div className="flex-1 text-[15px] leading-[1.55] text-foreground pt-1">
                      <div className="text-[12.5px] text-muted-foreground font-bold mb-1">Claude</div>

                      {/* Thinking: animated indicator while thinking, accordion when done */}
                      {m.streaming && m.thinking && !m.content ? (
                        <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-1.5">
                          <div className="inline-flex gap-1.25">
                            <span className="size-1.75 rounded-full bg-muted-foreground/50 animate-thinking-dot" />
                            <span className="size-1.75 rounded-full bg-muted-foreground/50 animate-thinking-dot animate-thinking-dot-2" />
                            <span className="size-1.75 rounded-full bg-muted-foreground/50 animate-thinking-dot animate-thinking-dot-3" />
                          </div>
                          Thinking…
                        </div>
                      ) : !m.streaming && m.thinking ? (
                        <details className="mb-2 group">
                          <summary className="cursor-pointer list-none text-[11.5px] text-muted-foreground/70 flex items-center gap-1.5 select-none hover:text-muted-foreground transition-colors">
                            <span className="inline-block transition-transform group-open:rotate-90 text-[9px]">▶</span>
                            Thought for a moment
                          </summary>
                          <div className="mt-1.5 pl-3 border-l-2 border-border text-sm text-muted-foreground whitespace-pre-wrap font-light leading-relaxed max-h-64 overflow-y-auto">
                            <ReactMarkdown>
                              {m.thinking}
                            </ReactMarkdown>
                          </div>
                        </details>
                      ) : null}

                      {/* Text content or initial waiting dots */}
                      {m.content ? (
                        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none font-light text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      ) : m.streaming && !m.thinking ? (
                        <div className="inline-flex gap-1.25 py-1.5">
                          <span className="size-1.75 rounded-full bg-accent animate-thinking-dot" />
                          <span className="size-1.75 rounded-full bg-accent animate-thinking-dot animate-thinking-dot-2" />
                          <span className="size-1.75 rounded-full bg-accent animate-thinking-dot animate-thinking-dot-3" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              }
              if (m.role === 'question') {
                return (
                  <div key={i} className="flex gap-3.5 max-w-full">
                    <div className="size-7.5 rounded-[9px] shrink-0 grid place-items-center text-xs font-bold bg-accent text-accent-foreground">
                      C
                    </div>
                    <div className="flex-1 text-[15px] leading-[1.55] text-foreground pt-1 w-full">
                      <div className="text-[12.5px] text-muted-foreground font-semibold mb-1">Claude</div>
                      <p className="m-0">
                        <ReactMarkdown>
                          {m.question}
                        </ReactMarkdown>
                      </p>
                      {!m.answered && (
                        <div className="mt-2">
                          {m.suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {m.suggestions.map((s, idx) => (
                                <Button
                                  size='xs'
                                  variant='secondary'
                                  key={idx}
                                  onClick={() => handleAnswerQuestion(m.questionId, s)}
                                >
                                  {s}
                                </Button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 items-center mt-2 mr-24">
                            <Input
                              type="text"
                              value={questionAnswers[m.questionId] ?? ''}
                              onChange={e =>
                                setQuestionAnswers(prev => ({
                                  ...prev,
                                  [m.questionId]: e.target.value,
                                }))
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAnswerQuestion(m.questionId)
                                }
                              }}
                              placeholder="something else "
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => handleAnswerQuestion(m.questionId)}
                              disabled={!(questionAnswers[m.questionId] ?? '').trim()}
                            >
                              Answer
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              if (m.role === 'step') {
                return (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide px-1">{m.label}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )
              }
              if (m.role === 'phase') {
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border',
                        m.status === 'building'
                          ? 'bg-[oklch(0.78_0.16_80/0.1)] border-[oklch(0.78_0.16_80/0.3)] text-[oklch(0.55_0.1_80)]'
                          : 'bg-[oklch(0.7_0.15_145/0.1)] border-[oklch(0.7_0.15_145/0.3)] text-[oklch(0.45_0.1_145)]'
                      )}
                    >
                      {m.status === 'building' ? (
                        <span className="size-1.5 rounded-full bg-current animate-pulse" />
                      ) : (
                        <span className="text-[10px]">✓</span>
                      )}
                      {m.name}
                    </span>
                  </div>
                )
              }
              return null
            })}

            <div ref={messagesEndRef} />
          </div>

          {lowCredits && (
            <div className="px-5 pt-3 shrink-0">
              <Alert
                variant="destructive"
                className="flex items-center gap-2 py-2 px-3 [&>svg]:translate-y-0"
              >
                <AlertTriangle className="size-4 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis text-destructive">
                  <span className="font-medium">Low credits:</span>
                  <span>{effectiveCredits} left.</span>
                  {billing?.plan === 'free' && (
                    <Link to="/account" className="underline font-medium ml-auto">
                      Upgrade
                    </Link>
                  )}
                </div>
              </Alert>
            </div>
          )}

          {/* Chat composer */}
          <ChatComposer
            isSending={isSending}
            currentActivity={currentActivity}
            hasMessages={messages.length > 0}
            onSend={handleSend}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Preview pane */}
        <ResizablePanel defaultSize='70%' className="flex flex-col min-h-0 relative overflow-hidden" style={{ background: 'var(--warm)' } as React.CSSProperties}>
          {!compiledCode ? (
            <div className="flex-1 flex items-center justify-center p-9 overflow-auto">
              <div className="flex flex-col items-center text-center gap-4 px-8 py-15 text-muted-foreground">
                <div className="size-16 rounded-[18px] bg-card border-[1.5px] border-dashed border-input grid place-items-center text-[26px] text-foreground/30">
                  ◌
                </div>
                <h3 className="text-lg font-bold text-foreground m-0 tracking-[-0.01em]">
                  Your app will appear here
                </h3>
                <p className="text-sm text-muted-foreground max-w-85 leading-[1.55] m-0">
                  Send a message to Claude. As you chat, the preview updates in real time — try a
                  few things, then save it to your library.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <div className="w-full">
                <ErrorBoundary fallback={<div className="text-red">Something went wrong</div>}>
                  <AppPreview compiledCode={compiledCode} cssCode={cssCode} appId={widgetId ?? undefined} draft={true} />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
