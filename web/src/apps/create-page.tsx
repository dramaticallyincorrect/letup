import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as client from '@repo/data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Alert } from '@/components/ui/alert'
import { AppIcon, TINT_STYLES } from './components/app-icon'
import { AppPreview, type RuntimeErrorReport } from './app-preview'
import { getAppGlyph, getAppTint } from './data'
import {
  ArrowUp,
  AlertTriangle,
  Square,
  Sparkles,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ErrorBoundary } from 'react-error-boundary'

type ModelID = 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'deepseek-v4-flash'

type Model = {
  id: ModelID
  label: string
  description: string
  provider: 'claude' | 'deepseek'
}

const MODELS: Model[] = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', description: 'Most capable', provider: 'claude' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Balanced — default', provider: 'claude' },
  ...(import.meta.env.DEV
    ? [{ id: 'deepseek-v4-flash' as const, label: 'DeepSeek V4 Flash', description: 'Dev only', provider: 'deepseek' as const }]
    : []),
]



const DEFAULT_MODEL: ModelID = 'claude-sonnet-4-6'

const MORPH_GLYPHS = ['✦', '❀', '◐', '✿', '◈', '♫', '✷', '◆']

const MORPH_SIZE_CLASS = {
  lg: 'size-[60px] rounded-2xl text-[28px]',
  xl: 'size-[76px] rounded-[18px] text-[34px]',
} as const

function MorphingAppIcon({ size }: { size: 'lg' | 'xl' }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setIndex(i => (i + 1) % MORPH_GLYPHS.length)
    }, 2200)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      className={cn('grid place-items-center shrink-0 font-medium', MORPH_SIZE_CLASS[size])}
      style={TINT_STYLES.indigo}
    >
      <span key={index} className="animate-morph-in inline-block leading-none">
        {MORPH_GLYPHS[index]}
      </span>
    </div>
  )
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; thinking?: string; streaming: boolean }
  | { role: 'question'; questionId: string; question: string; suggestions: string[]; answered: boolean }

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
    default: return 'Working…'
  }
}

function ChatComposer({
  isSending,
  currentActivity,
  hasMessages,
  onSend,
  onStop,
  selectedModel,
  onModelChange,
  billing,
}: {
  isSending: boolean
  currentActivity: string | null
  hasMessages: boolean
  onSend: (text: string) => void
  onStop: () => void
  selectedModel: ModelID
  onModelChange: (m: ModelID) => void
  billing: client.BillingStatus | undefined
}) {
  const [inputValue, setInputValue] = useState('')

  function submit() {
    if (!inputValue.trim() || isSending) return
    onSend(inputValue)
    setInputValue('')
  }

  const activeModel = MODELS.find(m => m.id === selectedModel) ?? MODELS[0]

  return (
    <div className="px-5 pt-3 pb-5 shrink-0">
      {currentActivity && (
        <div
          key={currentActivity}
          className="mb-2.5 flex justify-end animate-activity-in"
        >
          <div className="inline-flex items-center gap-2 px-2">
            <span className="size-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
            <span className="text-[12px] text-muted-foreground truncate max-w-60">{currentActivity}</span>
          </div>
        </div>
      )}
      <div className="bg-card border border-border/70 rounded-3xl px-4 pt-3.5 pb-3 shadow-(--shadow-md) transition-all focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
        <Textarea
          rows={1}
          placeholder={hasMessages ? 'Ask to change something…' : 'Describe your app — what would you like to build?'}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={isSending}
          className="min-h-7 max-h-40 border-0 resize-none font-sans border-none bg-transparent focus:border-0 focus-visible:ring-0 px-1 text-[15px] placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center gap-1.5 mt-2">
          <Select
            value={selectedModel}
            onValueChange={(v) => onModelChange(v as ModelID)}
            disabled={isSending}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-auto gap-1.5 border-0 bg-transparent text-xs text-muted-foreground hover:bg-secondary shadow-none focus-visible:ring-0"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="text-sm">{activeModel.label}</span>
              </span>
            </SelectTrigger>
            <SelectContent
              position="popper" side="top" sideOffset={8} align="start" className='p-1.5'>
              {MODELS.map(m => (
                <SelectItem key={m.id} value={m.id} className="py-2" disabled={m.id === 'claude-opus-4-7' && billing?.plan !== 'pro'}>
                  <span className="flex items-center gap-2.5">
                    <span className="flex flex-col items-start">
                      <span className="text-sm">{m.label}</span>
                      {
                        m.id === 'claude-opus-4-7' && billing?.plan !== 'pro' ? <span className="text-[11px] text-foreground">Upgrade to unlock</span> : <span className="text-[11px] text-muted-foreground">{m.description}</span>
                      }
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1"></div>
          {isSending ? (
            <Button
              size='sm'
              variant='ghost'
              onClick={onStop}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Square className="fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              size='sm'
              disabled={!inputValue.trim()}
              onClick={submit}
              className="rounded-full transition active:scale-95 disabled:opacity-40"
            >
              <ArrowUp />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AppNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  return (
    <input
      className="text-[15px] font-bold bg-transparent border-0 px-1.5 py-0.5 -mx-1.5 rounded-md text-foreground font-sans outline-none tracking-[-0.01em] hover:bg-secondary focus:bg-secondary transition-colors truncate"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onChange(local)}
    />
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
  // cssCode is no longer rendered client-side (the iframe pulls its own CSS from
  // /apps/:appId/render). We still accept the initial value to avoid breaking the
  // CreatePageInnerProps contract, but it's intentionally unused.
  void initialCssCode
  const [isSending, setIsSending] = useState(false)
  const [currentActivity, setCurrentActivity] = useState<string | null>(null)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const [initError, setInitError] = useState<string | null>(null)
  const [lowCreditsBalance, setLowCreditsBalance] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelID>(DEFAULT_MODEL)
  const [hasShownVersion, setHasShownVersion] = useState<boolean>(initialCompiledCode != null)
  const [capturedError, setCapturedError] = useState<{ message: string; stack?: string } | null>(null)
  const verifyCollectorRef = useRef<{ checkId: string; errors: RuntimeErrorReport[] } | null>(null)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: billing } = useQuery({
    queryKey: ['billing-status'],
    queryFn: client.getBillingStatus,
    retry: false,
  })
  const effectiveCredits =
    lowCreditsBalance !== null ? lowCreditsBalance : billing?.credits ?? null
  const lowCreditsThreshold = billing?.plan === 'pro' ? 5 : 3
  const lowCredits = effectiveCredits !== null && effectiveCredits <= lowCreditsThreshold
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const status = isSending ? 'thinking' : hasShownVersion ? 'ready' : 'draft'
  const statusLabel = isSending ? 'Thinking' : hasShownVersion ? 'Ready' : 'Draft'

  const currentTint = widgetId ? getAppTint(widgetId) : 'coral'
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

    // Pre-arm the runtime-error collector for this build so that errors thrown
    // during the first render of a new compiled widget are captured even if
    // they fire before the server's `runtime_check` event arrives.
    verifyCollectorRef.current = { checkId: '', errors: [] }

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await client.buildApp(activeWidgetId, msg, { signal: ac.signal, model: selectedModel })
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
        } else if (event === 'paused') {
          // Build paused waiting for question answer. Stream will close naturally.
          // isSending / currentActivity are cleaned up in the finally block below.
        } else if (event === 'runtime_check') {
          const { checkId } = data as { checkId: string; attempt: number; maxAttempts: number }
          if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
          // Carry over any errors already captured during this build (e.g. from
          // the widget's first render, which fires before runtime_check arrives).
          const prior: RuntimeErrorReport[] = verifyCollectorRef.current?.errors ?? []
          verifyCollectorRef.current = { checkId, errors: prior }

          verifyTimerRef.current = setTimeout(async () => {
            const c = verifyCollectorRef.current
            verifyCollectorRef.current = null
            verifyTimerRef.current = null

            if (!c) return
            try {
              if (c.errors.length === 0) {
                setHasShownVersion(true)
                await client.reportRuntimeResult(c.checkId, { ok: true })
              } else {
                const seen = new Set<string>()
                const deduped = c.errors.filter(e => seen.has(e.message) ? false : (seen.add(e.message), true))
                const errText = deduped
                  .map(e => `[${e.source}] ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
                  .join('\n\n')
                await client.reportRuntimeResult(c.checkId, { ok: false, error: errText })
              }
            } catch (e) {
              console.error('Failed to report runtime result', e)
            }
          }, 700)
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
        } else if (event === 'cancelled') {
          queryClient.invalidateQueries({ queryKey: ['billing-status'] })
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content || 'Build stopped.',
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
      const isAbort = ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            content: isAbort
              ? last.content || 'Build stopped.'
              : err instanceof Error ? err.message : 'Something went wrong',
            streaming: true,
          }
        }
        return next
      })
    }

    abortRef.current = null
    setCurrentActivity(null)
    setIsSending(false)
    // Any errors after this point belong to the post-build interaction window
    // and should surface via the share-banner, not auto-fix.
    verifyCollectorRef.current = null
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current)
      verifyTimerRef.current = null
    }

  }

  function handleStop() {
    abortRef.current?.abort()
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current)
      verifyTimerRef.current = null
    }
    verifyCollectorRef.current = null

  }

  function handleRuntimeError(err: RuntimeErrorReport) {
    const collector = verifyCollectorRef.current
    if (collector) {
      collector.errors.push(err)
      return
    }
    // No active verification — only show the share-banner once the user has
    // already seen a working version. Pre-first-version errors before the
    // verification window opens are ignored (they'll be caught by the window
    // once it opens, since the same renders will replay).
    if (hasShownVersion) {
      setCapturedError({ message: err.message, stack: err.stack })
    }
  }

  async function handleShareError() {
    if (!capturedError) return
    const text = `The app encountered an error:\n\n${capturedError.message}${capturedError.stack ? `\n\n${capturedError.stack}` : ''}\n\nPlease fix it.`
    setCapturedError(null)
    await handleSend(text)
  }

  async function handleAnswerQuestion(questionId: string, directAnswer?: string) {
    const answer = (directAnswer ?? questionAnswers[questionId] ?? '').trim()
    if (!answer) return
    setQuestionAnswers(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    // Mark the question answered in local state optimistically.
    // handleSend will push the user + assistant messages.
    setMessages(prev =>
      prev.map(m => m.role === 'question' && m.questionId === questionId ? { ...m, answered: true } : m)
    )
    // The server detects the paused state and resumes the build with this answer.
    await handleSend(answer)
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
        <ResizablePanel
          defaultSize='30%'
          minSize='20%'
          className="flex flex-col min-h-0 bg-linear-to-b from-card via-card to-(--warm) relative overflow-hidden"
        >
          {/* Chat header */}
          <div className="px-5 py-3.5 flex items-center gap-3 shrink-0 relative">
            <AppIcon tint={currentTint} glyph={currentGlyph} size="md" />
            <div className="flex flex-col min-w-0 flex-1">
              <AppNameInput value={appName} onChange={setAppName} />

            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border',
                status === 'ready' && 'bg-[oklch(0.7_0.15_145/0.1)] border-[oklch(0.7_0.15_145/0.3)] text-[oklch(0.42_0.1_145)]',
                status === 'thinking' && 'bg-[oklch(0.78_0.16_80/0.12)] border-[oklch(0.78_0.16_80/0.35)] text-[oklch(0.5_0.1_80)]',
                status === 'draft' && 'bg-secondary border-border text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  status === 'ready' && 'bg-[oklch(0.55_0.15_145)]',
                  status === 'thinking' && 'bg-[oklch(0.65_0.16_80)] animate-pulse',
                  status === 'draft' && 'bg-muted-foreground/50',
                )}
              />
              {statusLabel}
            </span>
            <Button
              size="sm"
              disabled={!hasShownVersion}
              onClick={handleSave}
              variant={hasShownVersion ? 'default' : 'outline'}
              className="rounded-full"
            >
              <Sparkles className="size-3.5" />
              Add to library
            </Button>
            {/* Gradient underline */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent" />
          </div>

          {/* Chat scroll */}
          <div
            className="flex-1 overflow-y-auto px-6 pt-6 pb-4 flex flex-col gap-4 relative overflow-hidden"
            ref={scrollRef}
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 8px), black 100%)',
            }}
          >
            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="flex border-r ml-12 border-r-fuchsia-600 animate-soft-pop bg-muted p-2 rounded min-w-0">
                    <div
                      className="max-w-[85%] min-w-0 leading-[1.55] font-medium"
                    >
                      <div className="prose prose-sm max-w-none wrap-break-word [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:m-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )
              }
              if (m.role === 'assistant') {
                return (
                  <div key={i} className="max-w-full min-w-0 animate-soft-pop">
                    <div className="text-[14.5px] leading-[1.55] text-foreground">
                      <div>
                        {/* Thinking: animated indicator while thinking, accordion when done */}
                        {m.streaming && m.thinking && !m.content && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
                            <Sparkles className="size-3.5 text-accent animate-pulse" />
                            <span>thinking</span>
                            <span className="inline-flex gap-1 ml-1">
                              <span className="size-1.25 rounded-full bg-muted-foreground/50 animate-thinking-dot" />
                              <span className="size-1.25 rounded-full bg-muted-foreground/50 animate-thinking-dot animate-thinking-dot-2" />
                              <span className="size-1.25 rounded-full bg-muted-foreground/50 animate-thinking-dot animate-thinking-dot-3" />
                            </span>
                          </div>
                        )}

                        {/* Text content or initial waiting dots */}
                        {m.content ? (
                          <div className="prose prose-sm max-w-none leading-[1.55] wrap-break-word [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 mt-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          </div>
                        ) : m.streaming && !m.thinking ? (
                          <div className="inline-flex gap-1.25 py-0.5">
                            <span className="size-1.75 rounded-full bg-accent animate-thinking-dot" />
                            <span className="size-1.75 rounded-full bg-accent animate-thinking-dot animate-thinking-dot-2" />
                            <span className="size-1.75 rounded-full bg-accent animate-thinking-dot animate-thinking-dot-3" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              }
              if (m.role === 'question') {
                return (
                  <div key={i} className="max-w-full min-w-0 animate-soft-pop">
                    <div className="min-w-0">
                      <div
                        className="border-l-2 pl-3.5"
                        style={{
                          borderColor: 'var(--tint-amber-bg)',
                          color: 'var(--foreground)',
                        }}
                      >
                        <div className="text-[14.5px] leading-[1.55] [&>p]:m-0 prose prose-sm max-w-none">
                          <ReactMarkdown>{m.question}</ReactMarkdown>
                        </div>
                        {!m.answered && (
                          <div className="mt-3">
                            {m.suggestions.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {m.suggestions.map((s, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleAnswerQuestion(m.questionId, s)}
                                    className="rounded-full bg-secondary hover:bg-secondary/70 px-3 py-1 text-[12px] font-medium text-foreground transition-colors"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2 items-center mt-2">
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
                                placeholder="something else…"
                                className="flex-1 bg-card/80"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleAnswerQuestion(m.questionId)}
                                disabled={!(questionAnswers[m.questionId] ?? '').trim()}
                                className="rounded-full"
                              >
                                Answer
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
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
            onStop={handleStop}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            billing={billing}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Preview pane */}
        <ResizablePanel
          defaultSize='70%'
          className="flex flex-col min-h-0 relative overflow-hidden"
          style={{ background: 'var(--warm)' } as React.CSSProperties}
        >
          {!compiledCode ? (
            <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
              {/* Drifting gradient blobs */}
              <div
                className="absolute size-112 rounded-full blur-3xl opacity-50 animate-gradient-drift pointer-events-none"
                style={{ background: 'var(--tint-coral-bg)', top: '10%', left: '15%' }}
              />
              <div
                className="absolute size-96 rounded-full blur-3xl opacity-50 animate-gradient-drift-2 pointer-events-none"
                style={{ background: 'var(--tint-amber-bg)', bottom: '8%', right: '12%' }}
              />

              <div className="relative flex flex-col items-center gap-7 max-w-md w-full animate-soft-pop">
                <div className="animate-float">
                  <MorphingAppIcon size="xl" />
                </div>

                <div className="text-center">
                  <h3 className="text-2xl font-bold text-foreground tracking-tight">
                    Your app will appear here
                  </h3>
                  <p className="mt-2 text-[15px] text-muted-foreground max-w-80 leading-[1.55] mx-auto">
                    Send a message — the preview updates when the app is ready.
                  </p>
                </div>

              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto relative">
              <div className="w-full h-full">
                <ErrorBoundary
                  resetKeys={[compiledCode]}
                  onError={(err) => handleRuntimeError({
                    message: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                    source: 'render',
                  })}
                  fallback={hasShownVersion ? <div className="text-red p-4">Something went wrong</div> : <></>}
                >
                  <AppPreview
                    appId={widgetId}
                    draft={true}
                    // Reload the iframe whenever a fresh build lands (compiledCode changes).
                    reloadKey={compiledCode ?? undefined}
                    onRuntimeError={handleRuntimeError}
                    hideErrorPanel={!hasShownVersion}
                  />
                </ErrorBoundary>
              </div>

              {/* Cover the preview with the "your app will appear here" placeholder
                  while the first version is being verified, so the user never sees
                  the broken state. The widget still mounts under the overlay so
                  React render errors actually fire and get reported. */}
              {!hasShownVersion && (
                <div className="absolute inset-0 flex items-center justify-center p-8 overflow-auto" style={{ background: 'var(--warm)' }}>
                  <div
                    className="absolute size-112 rounded-full blur-3xl opacity-50 animate-gradient-drift pointer-events-none"
                    style={{ background: 'var(--tint-coral-bg)', top: '10%', left: '15%' }}
                  />
                  <div
                    className="absolute size-96 rounded-full blur-3xl opacity-50 animate-gradient-drift-2 pointer-events-none"
                    style={{ background: 'var(--tint-amber-bg)', bottom: '8%', right: '12%' }}
                  />
                  <div className="relative flex flex-col items-center gap-7 max-w-md w-full animate-soft-pop">
                    <div className="animate-float">
                      <MorphingAppIcon size="xl" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-foreground tracking-tight">
                        Your app will appear here
                      </h3>
                      <p className="mt-2 text-[15px] text-muted-foreground max-w-80 leading-[1.55] mx-auto">
                        Send a message — the preview updates when the app is ready.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {capturedError && (
                <div className="absolute top-3 right-3 z-10 max-w-sm animate-soft-pop">
                  <Alert variant="destructive" className="flex items-start gap-2 py-2.5 px-3 shadow-lg bg-card [&>svg]:translate-y-0.5">
                    <AlertTriangle className="size-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-destructive">Error captured in the preview</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={capturedError.message}>
                        {capturedError.message}
                      </p>
                      <div className="flex gap-1.5 mt-2">
                        <Button
                          size="sm"
                          className="rounded-full h-6 text-[11px] px-2.5"
                          onClick={handleShareError}
                          disabled={isSending}
                        >
                          Share with agent
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full h-6 text-[11px] px-2"
                          onClick={() => setCapturedError(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    <button
                      onClick={() => setCapturedError(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Dismiss"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Alert>
                </div>
              )}
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
