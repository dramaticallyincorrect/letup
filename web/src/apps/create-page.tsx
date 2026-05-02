import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import * as client from '@repo/data'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { WidgetPreview } from '../widgets/widget-preview'
import { STARTER_PROMPTS, getAppGlyph, getAppTint } from './data'

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; streaming: boolean }
  | { role: 'tool'; name: string }
  | { role: 'question'; questionId: string; question: string; answered: boolean }

type PreviewTab = 'preview' | 'source'

const BUILD_STEPS = ['Understand', 'Design', 'Build', 'Preview'] as const

export function CreatePage() {
  const navigate = useNavigate()
  const [widgetId, setWidgetId] = useState<string | null>(null)
  const [appName, setAppName] = useState('Untitled app')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [compiledCode, setCompiledCode] = useState<string | null>(null)
  const [cssCode, setCssCode] = useState<string | null>(null)
  const [sourceCode, setSourceCode] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview')
  const [buildStep, setBuildStep] = useState(0)
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
    setBuildStep(1)

    let activeWidgetId = widgetId
    if (!activeWidgetId) {
      try {
        const w = await client.createWidget('Untitled app')
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

    setTimeout(() => setBuildStep(2), 400)
    setTimeout(() => setBuildStep(3), 900)

    try {
      const res = await client.buildWidget(activeWidgetId, msg)
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
          const w = data as client.Widget
          setCompiledCode(w.compiledCode)
          setCssCode(w.cssCode)
          setSourceCode(w.sourceCode)
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
          setBuildStep(BUILD_STEPS.length)
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
    setBuildStep(BUILD_STEPS.length)
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
    await client.answerWidgetQuestion(questionId, answer)
  }

  async function handleSave() {
    if (!widgetId || !compiledCode) return
    await client.patchWidget(widgetId, { name: appName, status: 'published' })
    navigate({ to: '/' })
  }

  if (initError) {
    return (
      <div className="ma-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--ink-3)' }}>{initError}</p>
      </div>
    )
  }

  return (
    <div className="ma-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Chrome active="create" />

      <div className="ma-create-shell">
        {/* Chat pane */}
        <div className="ma-create-pane ma-create-chat">
          <div className="ma-chat-header">
            <AppIcon tint={currentTint} glyph={currentGlyph} size="sm" />
            <input
              className="ma-chat-header-name"
              value={appName}
              onChange={e => setAppName(e.target.value)}
            />
            <div style={{ flex: 1 }} />
            <span className="ma-chat-header-status">
              <span className="ma-status-dot" data-status={status} />
              {statusLabel}
            </span>
          </div>

          <div className="ma-chat-scroll" ref={scrollRef}>
            {messages.length === 0 && (
              <div>
                <div className="ma-chat-msg ma-chat-msg-claude">
                  <div className="ma-chat-msg-avatar">C</div>
                  <div className="ma-chat-msg-body">
                    <div className="ma-chat-msg-name">Claude</div>
                    <p>
                      What should we build? Describe it like you'd describe it to a friend — I'll
                      draft something and we can shape it together.
                    </p>
                  </div>
                </div>
                <div style={{ paddingLeft: 44, marginTop: 6 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                    }}
                  >
                    Or start from
                  </div>
                  <div className="ma-starter-grid">
                    {STARTER_PROMPTS.map(p => (
                      <button
                        key={p.title}
                        className="ma-starter-card"
                        onClick={() => handleSend(`${p.title} — ${p.sub}`)}
                      >
                        <div className="ma-starter-glyph tint-amber">{p.glyph}</div>
                        <div>
                          <div className="ma-starter-title">{p.title}</div>
                          <div className="ma-starter-sub">{p.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="ma-chat-msg ma-chat-msg-user">
                    <div className="ma-chat-msg-avatar">You</div>
                    <div className="ma-chat-msg-body">
                      <div className="ma-chat-msg-name">You</div>
                      <p>{m.content}</p>
                    </div>
                  </div>
                )
              }
              if (m.role === 'assistant') {
                return (
                  <div key={i} className="ma-chat-msg ma-chat-msg-claude">
                    <div className="ma-chat-msg-avatar">C</div>
                    <div className="ma-chat-msg-body">
                      <div className="ma-chat-msg-name">Claude</div>
                      {m.content ? (
                        <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
                      ) : m.streaming ? (
                        <div className="ma-thinking-dots">
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              }
              if (m.role === 'tool') {
                return (
                  <div key={i} className="ma-chat-msg ma-chat-msg-claude">
                    <div className="ma-chat-msg-avatar">C</div>
                    <div className="ma-chat-msg-body">
                      <div className="ma-chat-msg-action">
                        <span className="ma-chat-msg-action-icon">⚙</span>
                        <span className="ma-chat-msg-action-label">{m.name}</span>
                        <span className="ma-chat-msg-action-meta">running</span>
                      </div>
                    </div>
                  </div>
                )
              }
              if (m.role === 'question') {
                return (
                  <div key={i} className="ma-chat-msg ma-chat-msg-claude">
                    <div className="ma-chat-msg-avatar">C</div>
                    <div className="ma-chat-msg-body" style={{ width: '100%' }}>
                      <div className="ma-chat-msg-name">Claude</div>
                      <p>{m.question}</p>
                      {!m.answered && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <input
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
                            style={{
                              flex: 1,
                              border: '1.5px solid var(--line-2)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 14,
                              fontFamily: 'var(--font-jakarta)',
                              background: 'var(--bg)',
                              color: 'var(--ink)',
                              outline: 'none',
                            }}
                            autoFocus
                          />
                          <button
                            className="ma-btn ma-btn-primary ma-btn-sm"
                            onClick={() => handleAnswerQuestion(m.questionId)}
                            disabled={!(questionAnswers[m.questionId] ?? '').trim()}
                          >
                            Answer
                          </button>
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

          <div className="ma-chat-composer">
            <div className="ma-composer-box">
              <textarea
                rows={1}
                placeholder={
                  messages.length === 0
                    ? 'Describe your mini app…'
                    : 'Ask Claude to change something…'
                }
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={isSending}
              />
              <div className="ma-composer-bar">
                <div className="ma-composer-tools">
                  <button className="ma-composer-tool" title="Attach">
                    +
                  </button>
                  <button className="ma-composer-tool" title="Templates">
                    ▦
                  </button>
                </div>
                <button
                  className="ma-composer-send"
                  disabled={!inputValue.trim() || isSending}
                  onClick={() => handleSend()}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview pane */}
        <div className="ma-create-pane ma-create-preview">
          <div className="ma-preview-toolbar">
            <div className="ma-preview-tabs">
              <button
                className="ma-preview-tab"
                data-active={previewTab === 'preview' ? '1' : '0'}
                onClick={() => setPreviewTab('preview')}
              >
                ● Preview
              </button>
              <button
                className="ma-preview-tab"
                data-active={previewTab === 'source' ? '1' : '0'}
                onClick={() => setPreviewTab('source')}
              >
                ◧ Source
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <button className="ma-btn ma-btn-ghost ma-btn-sm" disabled={!compiledCode}>
              Open
            </button>
            <button className="ma-btn ma-btn-secondary ma-btn-sm" disabled={!compiledCode}>
              Share
            </button>
            <button
              className="ma-btn ma-btn-primary ma-btn-sm"
              disabled={!compiledCode}
              onClick={handleSave}
            >
              Save to library
            </button>
          </div>

          <div className="ma-preview-stage">
            {!compiledCode ? (
              <div className="ma-preview-empty">
                <div className="ma-preview-empty-mark">◌</div>
                <h3 className="ma-preview-empty-title">Your app will appear here</h3>
                <p className="ma-preview-empty-sub">
                  Send a message to Claude. As you chat, the preview updates in real time — try a
                  few things, then save it to your library.
                </p>
              </div>
            ) : previewTab === 'preview' ? (
              <div className="ma-preview-frame">
                <WidgetPreview compiledCode={compiledCode} cssCode={cssCode} />
              </div>
            ) : (
              <div className="ma-preview-frame" style={{ padding: 20 }}>
                <pre
                  style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: 'var(--ink-2)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  {sourceCode ?? 'No source code yet'}
                </pre>
              </div>
            )}
          </div>

          <div className="ma-build-log">
            {BUILD_STEPS.map((s, i) => (
              <span
                key={s}
                className="ma-build-log-step"
                data-state={
                  i < buildStep
                    ? 'done'
                    : i === buildStep && isSending
                      ? 'active'
                      : 'pending'
                }
              >
                {s}
              </span>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--ink-4)' }}>
              {messages.filter(m => m.role === 'assistant').length} edits
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
