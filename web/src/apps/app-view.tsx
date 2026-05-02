import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import * as client from '@repo/data'
import { AppPreview } from './app-preview'

export function AppViewPage() {
  const { appId } = useParams({ from: '/apps/$appId' })
  const { data: app, isPending, isError } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => client.getApp(appId),
  })

  if (isPending) {
    return (
      <div className="p-10 text-muted-foreground font-sans">
        Loading…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="p-10 text-muted-foreground font-sans">
        Failed to load app.{' '}
        <Link to="/" className="text-accent underline">
          Go back
        </Link>
      </div>
    )
  }

  return <AppPreview compiledCode={app.compiledCode} cssCode={app.cssCode} />
}
