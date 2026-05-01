import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import * as client from '@repo/data'
import { WidgetPreview } from './widget-preview'

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; streaming: boolean }
  | { role: 'tool'; name: string }
  | { role: 'question'; questionId: string; question: string; answered: boolean }

type PreviewTab = 'preview' | 'source'

export function WidgetBuilderPage() {
  const navigate = useNavigate()
  const [widgetId, setWidgetId] = useState<string | null>(null)
  const [widgetName, setWidgetName] = useState('Untitled Widget')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [compiledCode, setCompiledCode] = useState<string | null>(null)
  const [cssCode, setCssCode] = useState<string | null>(null)
  const [sourceCode, setSourceCode] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview')
  const [initError, setInitError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    client.createWidget('Untitled Widget').then(w => setWidgetId(w.id)).catch(() => {
      setInitError('Failed to create widget session. Please refresh and try again.')
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = inputValue.trim()
    if (!text || !widgetId || isSending) return

    setInputValue('')
    setIsSending(true)
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ])

    try {
      const res = await client.buildWidget(widgetId, text)
      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)

      const reader = res.body.getReader()
      for await (const { event, data } of client.parseSSE(reader)) {
        if (event === 'text') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + (data as { text: string }).text }
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
          setWidgetName(w.name)
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
          setMessages(prev => [...prev, { role: 'question', questionId, question, answered: false }])
        } else if (event === 'error') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: (data as { message: string }).message, streaming: false }
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
          next[next.length - 1] = { ...last, content: err instanceof Error ? err.message : 'Something went wrong', streaming: false }
        }
        return next
      })
    }

    setIsSending(false)
  }

  async function handleConfirmSave() {
    if (!widgetId) return
    await client.patchWidget(widgetId, { status: 'published' })
    navigate({ to: '/widgets' })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleAnswerQuestion(questionId: string) {
    const answer = (questionAnswers[questionId] ?? '').trim()
    if (!answer) return
    setQuestionAnswers(prev => { const next = { ...prev }; delete next[questionId]; return next })
    setMessages(prev => [
      ...prev.map(m => m.role === 'question' && m.questionId === questionId ? { ...m, answered: true } : m),
      { role: 'user' as const, content: answer },
    ])
    await client.answerWidgetQuestion(questionId, answer)
  }

  if (initError) {
    return (
      <div className="flex items-center justify-center h-screen text-destructive">
        <p>{initError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/widgets' })}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <span className="text-sm font-medium text-muted-foreground">Widget Builder</span>
          <span className="text-sm font-semibold">{widgetName}</span>
        </div>
        <button
          onClick={handleConfirmSave}
          disabled={!compiledCode}
          className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm &amp; Save
        </button>
      </div>

      {/* Main split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div className="flex flex-col w-[40%] min-w-0 border-r">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <p>Describe the widget you want to build</p>
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl bg-primary text-primary-foreground text-sm">
                      {msg.content}
                    </div>
                  </div>
                )
              }
              if (msg.role === 'assistant') {
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl bg-muted text-sm whitespace-pre-wrap">
                      {msg.content || (msg.streaming && <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse rounded-sm" />)}
                    </div>
                  </div>
                )
              }
              if (msg.role === 'tool') {
                return (
                  <div key={i} className="flex justify-start">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                      ⚙ {msg.name}
                    </span>
                  </div>
                )
              }
              if (msg.role === 'question') {
                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="flex justify-start">
                      <div className="max-w-[85%] px-3 py-2 rounded-2xl bg-muted border border-border text-sm whitespace-pre-wrap">
                        <span className="text-xs font-medium text-muted-foreground block mb-1">Question</span>
                        {msg.question}
                      </div>
                    </div>
                    {!msg.answered && (
                      <div className="flex gap-2 pl-1">
                        <input
                          type="text"
                          value={questionAnswers[msg.questionId] ?? ''}
                          onChange={e => setQuestionAnswers(prev => ({ ...prev, [msg.questionId]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAnswerQuestion(msg.questionId) } }}
                          placeholder="Your answer…"
                          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          autoFocus
                        />
                        <button
                          onClick={() => handleAnswerQuestion(msg.questionId)}
                          disabled={!(questionAnswers[msg.questionId] ?? '').trim()}
                          className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Answer
                        </button>
                      </div>
                    )}
                  </div>
                )
              }
              return null
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending || !widgetId}
                placeholder={isSending ? 'Building…' : 'Describe your widget or request changes…'}
                rows={3}
                className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isSending || !widgetId || !inputValue.trim()}
                className="px-3 py-2 self-end text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Enter to send, Shift+Enter for new line</p>
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex border-b px-4">
            {(['preview', 'source'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setPreviewTab(tab)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  previewTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {previewTab === 'preview' ? (
              <WidgetPreview compiledCode={compiledCode} cssCode={cssCode} />
            ) : (
              sourceCode ? (
                <pre className="text-xs font-mono bg-muted rounded-md p-4 overflow-auto h-full whitespace-pre-wrap break-all">
                  {sourceCode}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  <p>No source code yet</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
