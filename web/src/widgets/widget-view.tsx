import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import * as client from '@repo/data'
import { WidgetPreview } from './widget-preview'

export function WidgetViewPage() {
  const { appId } = useParams({ from: '/apps/$appId' })
  const { data: widget, isPending, isError } = useQuery({
    queryKey: ['widget', appId],
    queryFn: () => client.getWidget(appId),
  })

  if (isPending) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-jakarta)', color: 'var(--ink-3)' }}>
        Loading…
      </div>
    )
  }
  if (isError) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-jakarta)', color: 'var(--ink-3)' }}>
        Failed to load app.{' '}
        <Link to="/" style={{ color: 'var(--ma-accent)' }}>
          Go back
        </Link>
      </div>
    )
  }

  return <WidgetPreview compiledCode={widget.compiledCode} cssCode={widget.cssCode} />
}
