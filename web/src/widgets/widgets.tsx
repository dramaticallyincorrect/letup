import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as client from '@repo/data'

export function WidgetsPage() {
  const { data: widgets, isPending, isError } = useQuery({
    queryKey: ['widgets'],
    queryFn: client.getWidgets,
  })

  if (isPending) return <p className="p-6 text-muted-foreground">Loading widgets...</p>
  if (isError) return <p className="p-6 text-destructive">Failed to load widgets.</p>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Widgets</h1>
        <Link to="/widgets/new">
          <button className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            New Widget
          </button>
        </Link>
      </div>
      {widgets!.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg mb-2">No widgets yet</p>
          <p className="text-sm">Click "New Widget" to build your first one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgets!.map(widget => (
            <Link key={widget.id} to="/widgets/$widgetId" params={{ widgetId: widget.id }}>
              <div className="rounded-lg border bg-card p-4 hover:border-primary cursor-pointer transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{widget.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    widget.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {widget.status}
                  </span>
                </div>
                {widget.description && (
                  <p className="text-sm text-muted-foreground mt-1">{widget.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
