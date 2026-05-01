import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
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
    <WidgetPreview compiledCode={widget.compiledCode} cssCode={widget.cssCode} />
  )
}
