import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import * as client from '@repo/data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { AppIcon } from './components/app-icon'
import { AppPreview } from './app-preview'
import { getAppGlyph, getAppTint } from './data'
import { SendHorizonal } from 'lucide-react'

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; streaming: boolean }
  | { role: 'tool'; name: string }
  | { role: 'question'; questionId: string; question: string; answered: boolean }

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
  const [widgetId, setWidgetId] = useState<string | null>(initialWidgetId ?? null)
  const [appName, setAppName] = useState(initialAppName)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [compiledCode, setCompiledCode] = useState<string | null>(initialCompiledCode)
  const [cssCode, setCssCode] = useState<string | null>(initialCssCode)
  const [isSending, setIsSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const [initError, setInitError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const status = isSending ? 'thinking' : compiledCode ? 'ready' : 'draft'
  const statusLabel = isSending ? 'Thinking…' : compiledCode ? 'Ready' : 'Draft'

  const currentTint = widgetId ? getAppTint(widgetId) : 'graphite'
  const currentGlyph = getAppGlyph(appName)

  async function handleSend(text?: string) {
    const msg = (text ?? inputValue).trim()
    if (!msg || isSending) return

    setInputValue('')
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
        if (event === 'text') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content + (data as { text: string }).text,
              }
            }
            return next
          })
        } else if (event === 'tool_call') {
          setMessages(prev => [...prev, { role: 'tool', name: (data as { name: string }).name }])
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
          const { questionId, question } = data as { questionId: string; question: string }
          setMessages(prev => [
            ...prev,
            { role: 'question', questionId, question, answered: false },
          ])
        } else if (event === 'error') {
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
        }
      }
    } catch (err) {
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

    setIsSending(false)
  }

  async function handleAnswerQuestion(questionId: string) {
    const answer = (questionAnswers[questionId] ?? '').trim()
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
    ])
    await client.answerAppQuestion(questionId, answer)
  }

  async function handleSave() {
    if (!widgetId || !compiledCode) return
    await client.patchApp(widgetId, { name: appName, status: 'published' })
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
                      <p className="m-0 font-light  text-sm">{m.content}</p>
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
                      {m.content ? (
                        <p className="m-0 whitespace-pre-wrap font-light text-sm">{m.content}</p>
                      ) : m.streaming ? (
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
              if (m.role === 'tool') {
                return (
                  <div key={i} className="flex gap-3.5 max-w-full">
                    <div className="size-7.5 rounded-[9px] shrink-0 grid place-items-center text-xs font-bold bg-accent text-accent-foreground">
                      C
                    </div>
                    <div className="flex-1 text-[15px] leading-[1.55] text-foreground pt-1">
                      <div
                        className="mt-0 px-4 py-3 flex items-center gap-3 text-sm rounded-xl border border-border"
                        style={{ background: 'var(--warm)' }}
                      >
                        <span className="size-6.5 rounded-lg bg-accent text-accent-foreground grid place-items-center text-[13px] shrink-0">
                          ⚙
                        </span>
                        <span className="flex-1 text-foreground font-medium">{m.name}</span>
                        <span className="text-xs text-accent font-semibold bg-white/60 px-2 py-0.5 rounded-full">
                          running
                        </span>
                      </div>
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
                      <p className="m-0">{m.question}</p>
                      {!m.answered && (
                        <div className="flex gap-2 mt-2">
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
                            placeholder="Your answer…"
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
                      )}
                    </div>
                  </div>
                )
              }
              return null
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat composer */}
          <div className="px-5 py-4 pb-5 border-border bg-card shrink-0">
            <div className="bg-card border-[1.5px] border-input rounded-2xl px-4 pt-3.5 pb-3">
              <Textarea
                rows={1}
                placeholder={
                  messages.length === 0
                    ? 'Describe your app…'
                    : 'Ask Claude to change something…'
                }
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.metaKey) {
                    e.preventDefault()
                    handleSend()
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
                  onClick={() => handleSend()}
                >
                  <SendHorizonal />
                  Send
                </Button>
              </div>
            </div>
          </div>
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
                <AppPreview compiledCode={compiledCode} cssCode={cssCode} />
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
