import { useParams } from '@tanstack/react-router'
import { AppPreview } from './app-preview'
import { useEffect } from 'react'

export function AppViewPage() {
  const { appId } = useParams({ from: '/apps/$appId' })
  // const { isPending, isError } = useQuery({
  //   queryKey: ['app', appId],
  //   queryFn: () => client.getApp(appId),
  // })

  useEffect(() => {
    let link: HTMLLinkElement | null = document.querySelector('link[rel="manifest"]');

    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }

    // 4. Set the URI
    link.href = `${import.meta.env.VITE_API_URL}/apps/${appId}/manifest`;
  }, [appId])

  return <div className="h-screen w-full"><AppPreview appId={appId} /></div>
}
