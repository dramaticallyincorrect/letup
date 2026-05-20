import { useEffect, useRef, useState } from 'react'
import { appRenderUrl } from '@repo/data'

export type RuntimeErrorReport = {
  message: string
  stack?: string
  source?: 'render' | 'runtime'
}

export function AppPreview({
  appId,
  draft = false,
  reloadKey,
  onRuntimeError,
  hideErrorPanel = false,
}: {
  appId: string | null | undefined
  draft?: boolean
  // Bump to force the iframe to reload (e.g. after a new build iteration).
  reloadKey?: string | number
  onRuntimeError?: (err: RuntimeErrorReport) => void
  hideErrorPanel?: boolean
}) {
  const [error, setError] = useState<RuntimeErrorReport | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const onRuntimeErrorRef = useRef(onRuntimeError)
  onRuntimeErrorRef.current = onRuntimeError

  // Reset error state when the app or reload key changes.
  useEffect(() => {
    setError(null)
  }, [appId, draft, reloadKey])

  // Listen for runtime errors postMessaged from inside the iframe.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type !== 'app-error') return
      // Only accept messages from our own iframe.
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      const report: RuntimeErrorReport = {
        message: String(e.data.message ?? 'Unknown error'),
        stack: typeof e.data.stack === 'string' ? e.data.stack : undefined,
        source: 'runtime',
      }
      setError(report)
      onRuntimeErrorRef.current?.(report)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (!appId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <p>App preview will appear here</p>
      </div>
    )
  }

  const src = appRenderUrl(appId, draft)

  return (
    <div className="relative w-full h-full">
      <iframe
        ref={iframeRef}
        key={reloadKey ?? `${appId}-${draft ? 'draft' : 'published'}`}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        className="w-full h-full border-0 block"
        title="App"
      />
      {error && !hideErrorPanel && (
        <div className="absolute bottom-0 left-0 right-0 p-4 text-sm text-destructive bg-destructive/10 border-t border-destructive/30">
          <p className="font-medium">Runtime error</p>
          <p className="mt-1 font-mono text-xs whitespace-pre-wrap">{error.message}</p>
          {error.stack && <pre className="mt-2 font-mono text-xs opacity-70 overflow-auto max-h-32">{error.stack}</pre>}
        </div>
      )}
    </div>
  )
}
