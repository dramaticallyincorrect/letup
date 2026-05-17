import { useState, useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as client from '@repo/data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, PlusIcon, SearchIcon, SparklesIcon } from 'lucide-react'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { Modal } from './components/modal'
import { Toast } from './components/toast'
import {
  widgetToAppCard,
  type AppCard,
} from './data'
import { useSession } from '@/lib/auth-client'

export function HomePage() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  const { data: widgets = [], isPending } = useQuery({
    queryKey: ['widgets'],
    queryFn: client.getApps,
  })

  const { data: billing } = useQuery({
    queryKey: ['billing-status'],
    queryFn: client.getBillingStatus,
    enabled: isLoggedIn,
    retry: false,
  })

  const showUpgradeBanner = billing?.plan === 'free'

  const myApps = useMemo(() => widgets.map(widgetToAppCard), [widgets])

  const filteredMine = useMemo(() => {
    const q = search.trim().toLowerCase()
    return myApps.filter(a => {
      if (category !== 'All' && a.category !== category) return false
      if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [myApps, category, search])

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased coral">
      <Chrome active="library" search={search} onSearch={setSearch} />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8 max-[900px]:pb-20">
        <div className="flex items-end justify-between gap-6 mb-9">
          <div>
            <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
              Your <span className="text-accent not-italic">apps</span>
            </h1>
            <p className="text-[15px] text-muted-foreground m-0">
              <br></br>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 mb-6 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {['All', ...new Set(myApps.map((e) => e.category))].slice(0, 7).map(c => (
              <button
                key={c}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[13px] font-medium border border-border text-muted-foreground hover:bg-secondary cursor-pointer transition-colors bg-transparent',
                  category === c && 'bg-foreground text-background border-foreground',
                )}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 w-70 h-9 px-3.5 bg-secondary rounded-full border border-transparent focus-within:border-input focus-within:bg-card transition-colors cursor-text max-[900px]:w-[160px]">
            <SearchIcon size='16' />
            <input
              className="flex-1 min-w-0 h-full bg-transparent border-0 text-sm text-foreground outline-none placeholder:text-muted-foreground font-sans"
              placeholder="Search apps…"
              value={search}
              onChange={e => setSearch?.(e.target.value)}
            />
          </label>
        </div>

        {showUpgradeBanner && <UpgradeBanner />}
        <LibraryView apps={filteredMine} loading={isPending} onToast={setToast} />
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}


function LibraryView({
  apps,
  loading,
  onToast,
}: {
  apps: AppCard[]
  loading: boolean
  onToast: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<AppCard | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const isDraft = (pendingDelete?.latestVersionNumber ?? 0) === 0

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      if (pendingDelete.latestVersionNumber === 0) {
        await client.deleteApp(pendingDelete.id)
        onToast(`"${pendingDelete.name}" deleted`)
      } else {
        await client.uninstallApp(pendingDelete.id)
        onToast(`"${pendingDelete.name}" uninstalled`)
      }
      await queryClient.invalidateQueries({ queryKey: ['widgets'] })
    } finally {
      setIsDeleting(false)
      setPendingDelete(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20 px-5 text-muted-foreground">
        <div className="text-[32px] mb-2 text-foreground/30">◌</div>
        <p>Loading your apps…</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4.5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-[900px]:grid-cols-[repeat(2,1fr)] max-[600px]:grid-cols-1">
        <Link
          to="/create"
          className="p-5.5 flex flex-col gap-4 border-[1.5px] border-dashed border-input rounded-(--radius-lg) min-h-44.5 hover:border-accent hover:bg-accent/10 transition-colors no-underline text-foreground"
        >
          <div className="size-12 rounded-xl bg-foreground grid place-items-center text-[22px] text-background">
            <PlusIcon className='rounded-xl items-center bg-foreground text-background' />
          </div>
          <h3 className="font-bold text-base tracking-[-0.01em] m-0">Create new app</h3>
          <p className="text-[13.5px] text-muted-foreground m-0">Describe an idea. Claude builds the rest.</p>
        </Link>

        {apps.map(a => (
          <AppCardTile key={a.id} app={a} onDeleteRequest={setPendingDelete} />
        ))}

        {apps.length === 0 && (
          <div className="col-span-full text-center py-15 px-5 text-muted-foreground">
            No apps yet — create your first one!
          </div>
        )}
      </div>

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete ? <>{isDraft ? 'Delete' : 'Uninstall'} "{pendingDelete.name}"?</> : null}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting
                ? isDraft ? 'Deleting…' : 'Uninstalling…'
                : isDraft ? 'Delete' : 'Uninstall'}
            </Button>
          </>
        }
      >
        <p className="m-0">
          {isDraft
            ? 'This will permanently delete the draft app.'
            : 'This will remove the app from your library.'}
        </p>
      </Modal>
    </>
  )
}

function UpgradeBanner() {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-4 mb-6 px-5 py-4 rounded-2xl border border-border bg-secondary/60">
      <div
        className="size-9 rounded-xl grid place-items-center shrink-0"
        style={{ background: 'var(--tint-amber-bg)', color: 'var(--tint-amber-fg)' }}
      >
        <SparklesIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground m-0">Free plan · 1 app limit</p>
        <p className="text-xs text-muted-foreground m-0 mt-0.5">
          Upgrade to Pro for unlimited apps and 100 credits / month.
        </p>
      </div>
      <Button
        size="sm"
        className="rounded-full font-semibold shrink-0"
        onClick={() => navigate({ to: '/payment' })}
      >
        Upgrade to Pro
      </Button>
    </div>
  )
}

function AppCardTile({
  app,
  onDeleteRequest,
}: {
  app: AppCard
  onDeleteRequest: (app: AppCard) => void
}) {
  const navigate = useNavigate()

  return (
    <Card className="group hover:-translate-y-0.5 hover:shadow-(--shadow-md) transition-all cursor-pointer relative overflow-hidden p-0 gap-0">
      <Link to="/apps/$appId" params={{ appId: app.id }} className="no-underline block">
        <CardContent className="p-5.5 flex flex-col gap-4">
          {app.latestVersionNumber === 0 && (
            <Badge
              variant="secondary"
              className="absolute top-4 left-4 text-[11px] font-semibold"
              style={{ background: 'var(--tint-amber-bg)', color: 'var(--tint-amber-fg)' }}
            >
              Draft
            </Badge>
          )}
          <AppIcon tint={app.tint} glyph={app.glyph} />
          <div>
            <h3 className="font-bold text-base text-foreground tracking-[-0.01em] m-0">{app.name}</h3>
            <p className="text-[13.5px] leading-normal text-muted-foreground mt-1 line-clamp-2 m-0">
              {app.description}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground font-medium mt-auto">
            <span>{app.category}</span>
          </div>
        </CardContent>
      </Link>

      <div className="absolute top-2.5 right-2.5 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 bg-background/80 hover:bg-background"
              onClick={e => e.preventDefault()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={e => {
                e.preventDefault()
                navigate({ to: '/apps/$appId/edit', params: { appId: app.id } })
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={e => {
                e.preventDefault()
                onDeleteRequest(app)
              }}
            >
              {app.latestVersionNumber === 0 ? 'Delete' : 'Uninstall'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}

