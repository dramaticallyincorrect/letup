import React, { useState, useEffect } from 'react'
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
import { generateText } from '@repo/data'
import postcss from 'postcss'
// @ts-expect-error — no type definitions for postcss-prefix-selector
import prefixSelector from 'postcss-prefix-selector'

const WIDGET_SCOPE = 'widget-root'

function scopeCss(css: string): string {
  return postcss([prefixSelector({ prefix: `.${WIDGET_SCOPE}` })]).process(css, { from: undefined }).css
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

export function AppPreview({
  compiledCode,
  cssCode,
}: {
  compiledCode: string | null
  cssCode?: string | null
}) {
  const [Component, setComponent] = useState<React.ComponentType<{ data: Record<string, unknown> }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Inject the design system CSS scoped to .widget-root, clean up on change
  useEffect(() => {
    const styleId = 'widget-design-system'
    const existing = document.getElementById(styleId)
    if (existing) existing.remove()

    if (!cssCode) return

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = scopeCss(cssCode)
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
            node.textContent = scopeCss(node.textContent)
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
        setError('Widget has no default export')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render widget')
      setComponent(null)
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
      <Component data={{}} />
    </div>
  )
}
