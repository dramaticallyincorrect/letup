import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import * as client from '@repo/data'
import { WidgetPreview } from './widget-preview'

export function WidgetViewPage() {
  const { widgetId } = useParams({ from: '/widgets/$widgetId' })
  const { data: widget, isPending, isError } = useQuery({
    queryKey: ['widget', widgetId],
    queryFn: () => client.getWidget(widgetId),
  })

  if (isPending) return <p className="p-6 text-muted-foreground">Loading widget...</p>
  if (isError) return <p className="p-6 text-destructive">Failed to load widget.</p>

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Link to="/widgets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        <span className="text-sm font-semibold">{widget.name}</span>
        {widget.description && (
          <span className="text-sm text-muted-foreground">{widget.description}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <WidgetPreview compiledCode={widget.compiledCode} cssCode={widget.cssCode} />
      </div>
    </div>
  )
}
