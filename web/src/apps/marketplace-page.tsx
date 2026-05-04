import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { Modal } from './components/modal'
import { Toast } from './components/toast'
import {
  CATEGORIES,
  MARKETPLACE_APPS,
  type MarketplaceApp,
} from './data'

export function MarketplacePage() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<MarketplaceApp | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return MARKETPLACE_APPS.filter(a => {
      if (category !== 'All' && a.category !== category) return false
      if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [search, category])

  function handleInstall(app: MarketplaceApp) {
    setInstalling(null)
    setToast(`${app.name} added to your apps`)
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="marketplace" search={search} onSearch={setSearch} />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8 max-[900px]:pb-20">
        <div className="flex items-end justify-between gap-6 mb-9">
          <div>
            <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
              The <span className="text-accent not-italic">marketplace</span>
            </h1>
            <p className="text-[15px] text-muted-foreground m-0">
              Hand-picked mini apps built by the community
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 mb-[22px] flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.slice(0, 7).map(c => (
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
        </div>

        <MarketCurated apps={filtered} onInstall={setInstalling} />
      </main>

      <Modal
        open={!!installing}
        onClose={() => setInstalling(null)}
        title={
          installing ? (
            <>
              <AppIcon tint={installing.tint} glyph={installing.glyph} />
              Add {installing.name}?
            </>
          ) : null
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setInstalling(null)}>
              Cancel
            </Button>
            <Button onClick={() => installing && handleInstall(installing)}>
              Add to my apps
            </Button>
          </>
        }
      >
        {installing && (
          <>
            <p className="m-0 mb-3">{installing.description}</p>
            <div className="flex gap-[18px] text-xs text-muted-foreground mt-3.5 pt-3.5 border-t border-border">
              <span>by {installing.author}</span>
              <span>★ {installing.rating}</span>
              <span>{installing.installs} installs</span>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

function MarketCurated({
  apps,
  onInstall,
}: {
  apps: MarketplaceApp[]
  onInstall: (a: MarketplaceApp) => void
}) {
  const featured = apps.filter(a => a.featured)
  const rest = apps.filter(a => !a.featured)
  const [hero, ...others] = featured.length ? featured : apps
  const trending = rest.slice(0, 4)

  if (!hero) {
    return (
      <div className="text-center py-20 px-5 text-muted-foreground">
        <div className="text-[32px] mb-2 text-foreground/30">◌</div>
        <p>No apps found.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-[18px] mb-9 grid-cols-1 md:[grid-template-columns:2fr_1fr_1fr]">
        <HeroCard app={hero} featured onClick={() => onInstall(hero)} />
        {others.slice(0, 2).map(a => (
          <HeroCard key={a.id} app={a} onClick={() => onInstall(a)} />
        ))}
      </div>

      {trending.length > 0 && (
        <>
          <div className="text-xl font-bold tracking-[-0.015em] mt-9 mb-4 text-foreground flex items-baseline gap-3 leading-none">
            Trending this week{' '}
            <small className="text-[13px] text-muted-foreground font-medium">updated 2 hours ago</small>
          </div>
          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] max-[900px]:[grid-template-columns:repeat(2,1fr)]">
            {trending.map(a => (
              <Card
                key={a.id}
                className="hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all cursor-pointer p-0 gap-0"
                onClick={() => onInstall(a)}
              >
                <CardContent className="p-[22px] flex flex-col gap-4">
                  <AppIcon tint={a.tint} glyph={a.glyph} />
                  <div>
                    <h3 className="font-bold text-base text-foreground tracking-[-0.01em] m-0">{a.name}</h3>
                    <p className="text-[13.5px] leading-[1.5] text-muted-foreground mt-1 line-clamp-2 m-0">
                      {a.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground font-medium mt-auto">
                    <span>by {a.author}</span>
                    <span className="size-[3px] rounded-full bg-current opacity-50" />
                    <span>★ {a.rating}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="text-xl font-bold tracking-[-0.015em] mt-9 mb-4 text-foreground flex items-baseline gap-3 leading-none">
        Browse all{' '}
        <small className="text-[13px] text-muted-foreground font-medium">{apps.length} apps</small>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-9 gap-y-0">
        {apps.map((a, i) => (
          <div
            key={a.id}
            className={cn(
              'grid [grid-template-columns:60px_1fr_auto] gap-4 items-center py-3.5 border-t border-border cursor-pointer',
              i < 2 && 'border-t-0',
            )}
            onClick={() => onInstall(a)}
          >
            <AppIcon tint={a.tint} glyph={a.glyph} size="lg" />
            <div className="min-w-0">
              <h4 className="font-bold text-[15px] m-0 tracking-[-0.005em]">{a.name}</h4>
              <p className="text-[13px] text-muted-foreground truncate mt-0.5 m-0">{a.description}</p>
              <div className="text-[12.5px] text-muted-foreground font-medium mt-1">
                ★ {a.rating} · {a.installs} installs
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={e => {
                e.stopPropagation()
                onInstall(a)
              }}
            >
              Add
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}

function HeroCard({
  app,
  featured = false,
  onClick,
}: {
  app: MarketplaceApp
  featured?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        'p-[30px] rounded-[var(--radius-lg)] border flex flex-col gap-4 cursor-pointer transition-all hover:-translate-y-0.5 min-h-[240px] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]',
        featured
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card border-border',
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'text-[11.5px] font-bold uppercase tracking-[0.08em]',
          featured ? 'text-white/70' : 'text-accent',
        )}
      >
        {app.tag ?? 'Featured'}
      </span>
      <AppIcon tint={app.tint} glyph={app.glyph} size="lg" />
      <h2 className="text-2xl font-bold tracking-[-0.02em] m-0 leading-[1.15]">{app.name}</h2>
      <p
        className={cn(
          'text-[14.5px] leading-[1.5] m-0',
          featured ? 'text-white/[0.82]' : 'text-muted-foreground',
        )}
      >
        {app.description}
      </p>
      <div
        className={cn(
          'mt-auto flex items-center gap-2.5 text-[13px] font-medium',
          featured ? 'text-white/60' : 'text-muted-foreground',
        )}
      >
        <span>by {app.author}</span>
        <span>·</span>
        <span>★ {app.rating}</span>
        <span>·</span>
        <span>{app.installs} installs</span>
      </div>
    </div>
  )
}
