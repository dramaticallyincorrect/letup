import React, { useState, useEffect, useRef } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import * as FramerMotion from 'framer-motion'
import * as RadixUI from 'radix-ui'
import * as LucideIcons from 'lucide-react'
import * as CVA from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { generateText, queryAppDb } from '@repo/data'
const WIDGET_SCOPE = 'widget-root'

const routerModule = {
  useRouter: () => {
    const [path, setPath] = React.useState<string>(() => window.location.hash.slice(1) || '/')
    React.useEffect(() => {
      const handler = () => setPath(window.location.hash.slice(1) || '/')
      window.addEventListener('hashchange', handler)
      return () => window.removeEventListener('hashchange', handler)
    }, [])
    const navigate = React.useCallback((to: string) => { window.location.hash = to }, [])
    return { path, navigate }
  },
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href: `#${to}`, ...props }, children),
}

// Modules the widget sandbox can import via require()
const shadcnRegistry: Record<string, Record<string, unknown>> = {
  'framer-motion': FramerMotion as unknown as Record<string, unknown>,
  'radix-ui': RadixUI as unknown as Record<string, unknown>,
  'lucide-react': LucideIcons as unknown as Record<string, unknown>,
  'class-variance-authority': CVA as unknown as Record<string, unknown>,
  'tailwind-merge': { twMerge } as Record<string, unknown>,
  '@/components/ui/button': { Button },
  '@/components/ui/dialog': {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  },
  '@/components/ui/input': { Input },
  '@/components/ui/label': { Label },
  '@/components/ui/textarea': { Textarea },
  '@/lib/utils': { cn },
  'ai': { generateText },
}

export type RuntimeErrorReport = {
  message: string
  stack?: string
  source: 'compile' | 'render' | 'window' | 'rejection' | 'console'
}

export function AppPreview({
  compiledCode,
  cssCode,
  appId,
  draft = false,
  onRuntimeError,
  hideErrorPanel = false,
}: {
  compiledCode: string | null
  cssCode?: string | null
  appId?: string
  draft?: boolean
  onRuntimeError?: (err: RuntimeErrorReport) => void
  hideErrorPanel?: boolean
}) {
  const [Component, setComponent] = useState<React.ComponentType<{ data: Record<string, unknown> }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onRuntimeErrorRef = useRef(onRuntimeError)
  useEffect(() => { onRuntimeErrorRef.current = onRuntimeError }, [onRuntimeError])
  const report = (err: RuntimeErrorReport) => {
    onRuntimeErrorRef.current?.(err)
  }

  // Inject fallback CSS so Radix UI portal elements (Dialog, Select, Popover, etc.)
  // are always correctly positioned regardless of what the widget's compiled CSS covers.
  // This is a one-time static injection — no cleanup needed.
  useEffect(() => {
    // const id = 'widget-portal-base'
    // if (document.getElementById(id)) return
    // const style = document.createElement('style')
    // style.id = id
    // style.textContent = `
    //   [data-slot="dialog-content"] {
    //     position: fixed;
    //     top: 50%;
    //     left: 50%;
    //     transform: translate(-50%, -50%);
    //     z-index: 50;
    //   }
    //   [data-slot="dialog-overlay"] {
    //     position: fixed;
    //     inset: 0;
    //     z-index: 50;
    //     background-color: rgb(0 0 0 / 0.5);
    //   }
    // `
    // document.head.appendChild(style)
  }, [])

  // Inject the design system CSS globally so both the widget and Radix UI portals
  // (Dialog, Select, Popover, etc. rendered into document.body) get the correct styles.
  useEffect(() => {
    const styleId = 'widget-design-system'
    const existing = document.getElementById(styleId)
    if (existing) existing.remove()

    if (!cssCode) return

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = cssCode
    style.dataset.widgetTransformed = 'true'
    document.head.appendChild(style)

    return () => {
      document.getElementById(styleId)?.remove()
    }
  }, [cssCode])

  // Intercept any <style> tags the widget component injects into document.head and scope them
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof HTMLStyleElement &&
            node.dataset.widgetTransformed !== 'true' &&
            node.textContent
          ) {
            node.dataset.widgetTransformed = 'true'
            node.dataset.widgetInjected = 'true'
          }
        }
      }
    })

    observer.observe(document.head, { childList: true })

    return () => {
      observer.disconnect()
      document.querySelectorAll('[data-widget-injected]').forEach((el) => el.remove())
    }
  }, [])

  useEffect(() => {
    if (!compiledCode) {
      setComponent(null)
      setError(null)
      return
    }
    try {
      const exportsObj: Record<string, unknown> = {}
      const moduleObj = { exports: exportsObj }
      const req = (name: string) => {
        if (name === 'react') return React
        if (name === 'react/jsx-runtime') return ReactJSXRuntime
        if (name === 'react-dom') return ReactDOM
        if (name === 'react-dom/client') return ReactDOMClient
        if (name === 'router') return routerModule
        if (name === 'db') return {
          query: (sql: string, params?: unknown[]) => appId ? queryAppDb(appId, sql, params, draft) : Promise.reject(new Error('No appId')),
        }
        if (name in shadcnRegistry) return shadcnRegistry[name]
        return {}
      }
      // eslint-disable-next-line no-new-func
      new Function('React', 'exports', 'module', 'require', compiledCode)(
        React, exportsObj, moduleObj, req
      )
      const Comp = (moduleObj.exports as Record<string, unknown>).default
      if (typeof Comp === 'function') {
        setComponent(() => Comp as React.ComponentType<{ data: Record<string, unknown> }>)
        setError(null)
      } else {
        const message = 'Widget has no default export'
        setError(message)
        report({ message, source: 'compile' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to render widget'
      setError(message)
      setComponent(null)
      report({ message, stack: err instanceof Error ? err.stack : undefined, source: 'compile' })
    }
  }, [compiledCode, appId, draft])

  // Global runtime error capture while the widget is mounted: window errors,
  // unhandled promise rejections, and console.error calls.
  useEffect(() => {
    if (!compiledCode) return
    const onError = (e: ErrorEvent) => {
      report({
        message: e.message || String(e.error),
        stack: e.error?.stack,
        source: 'window',
      })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      report({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        source: 'rejection',
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    // Patch fetch to capture HTTP errors from db/ai modules and external APIs.
    // Internal infrastructure calls (auth, billing, build, etc.) are excluded.
    const apiBase = (import.meta.env.VITE_API_URL ?? '') as string
    const originalFetch = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await originalFetch(...args)
      if (!res.ok) {
        const rawUrl = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0])
        const isOwnApi = rawUrl.startsWith('/') || (apiBase !== '' && rawUrl.startsWith(apiBase))
        const isDbOrAi = /\/apps\/[^/]+\/db\/query|\/ai\/generate/.test(rawUrl)
        const isExternal = !isOwnApi
        if (isDbOrAi || isExternal) {
          report({
            message: `HTTP ${res.status}: ${rawUrl}`,
            source: 'window',
          })
        }
      }
      return res
    }

    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      try {
        const first = args[0]
        const message = first instanceof Error
          ? first.message
          : args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' ')
        report({
          message,
          stack: first instanceof Error ? first.stack : undefined,
          source: 'console',
        })
      } catch { /* never let reporting break console */ }
      originalConsoleError.apply(console, args)
    }

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      console.error = originalConsoleError
      window.fetch = originalFetch
    }
  }, [compiledCode])

  if (!compiledCode) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <p>Widget preview will appear here</p>
      </div>
    )
  }

  if (error) {
    if (hideErrorPanel) return null
    return (
      <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md">
        <p className="font-medium">Render error</p>
        <p className="mt-1 font-mono text-xs">{error}</p>
      </div>
    )
  }

  if (!Component) return null

  return (
    <div className={WIDGET_SCOPE}>
      <ErrorBoundary
        resetKeys={[compiledCode]}
        onError={(err) => report({
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          source: 'render',
        })}
        fallback={hideErrorPanel ? <></> : (
          <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md">
            <p className="font-medium">Render error</p>
            <p className="mt-1 font-mono text-xs">Widget threw while rendering.</p>
          </div>
        )}
      >
        <Component data={{}} />
      </ErrorBoundary>
    </div>
  )
}
