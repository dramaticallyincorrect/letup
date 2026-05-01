import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { Modal } from './components/modal'
import { Toast } from './components/toast'
import {
  CATEGORIES,
  MARKETPLACE_APPS,
  widgetToAppCard,
  type AppCard,
  type MarketplaceApp,
} from './data'

export function HomePage() {
  const [tab, setTab] = useState<'mine' | 'marketplace'>('mine')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<MarketplaceApp | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { data: widgets = [], isPending } = useQuery({
    queryKey: ['widgets'],
    queryFn: client.getWidgets,
  })

  const myApps = useMemo(() => widgets.map(widgetToAppCard), [widgets])

  const filteredMine = useMemo(() => {
    const q = search.trim().toLowerCase()
    return myApps.filter(a => {
      if (category !== 'All' && a.category !== category) return false
      if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [myApps, category, search])

  const filteredMarket = useMemo(() => {
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
    <div className="ma-page">
      <Chrome active="library" search={search} onSearch={setSearch} />

      <main className="ma-page-inner">
        <div className="ma-page-header">
          <div>
            <h1 className="ma-page-title">
              {tab === 'mine' ? <>Your <em>apps</em></> : <>The <em>marketplace</em></>}
            </h1>
            <p className="ma-page-subtitle">
              {tab === 'mine'
                ? `${myApps.length} little tools, made by you for you`
                : 'Hand-picked mini apps built by the community'}
            </p>
          </div>
          <Link to="/create" className="ma-btn ma-btn-primary ma-btn-lg">
            <span style={{ fontSize: 16, marginTop: -2 }}>+</span> Create new app
          </Link>
        </div>

        <div className="ma-lib-toolbar">
          <div className="ma-lib-tabs">
            <button
              className="ma-lib-tab"
              data-active={tab === 'mine' ? '1' : '0'}
              onClick={() => setTab('mine')}
            >
              My apps <span className="ma-lib-tab-count">{myApps.length}</span>
            </button>
            <button
              className="ma-lib-tab"
              data-active={tab === 'marketplace' ? '1' : '0'}
              onClick={() => setTab('marketplace')}
            >
              Marketplace <span className="ma-lib-tab-count">{MARKETPLACE_APPS.length}</span>
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <div className="ma-chip-row">
            {CATEGORIES.slice(0, 7).map(c => (
              <button
                key={c}
                className="ma-chip"
                data-active={category === c ? '1' : '0'}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {tab === 'mine' ? (
          <LibraryView apps={filteredMine} loading={isPending} />
        ) : (
          <MarketCurated apps={filteredMarket} onInstall={setInstalling} />
        )}
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
            <button className="ma-btn ma-btn-ghost" onClick={() => setInstalling(null)}>
              Cancel
            </button>
            <button
              className="ma-btn ma-btn-primary"
              onClick={() => installing && handleInstall(installing)}
            >
              Add to my apps
            </button>
          </>
        }
      >
        {installing && (
          <>
            <p style={{ margin: '0 0 12px' }}>{installing.description}</p>
            <div
              style={{
                display: 'flex',
                gap: 18,
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid var(--line)',
              }}
            >
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

// ── Library view ──────────────────────────────────────────────────────

function LibraryView({ apps, loading }: { apps: AppCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="ma-empty">
        <div className="ma-empty-glyph">◌</div>
        <p>Loading your apps…</p>
      </div>
    )
  }

  return (
    <div className="ma-grid">
      <Link to="/create" className="ma-create-card">
        <div className="ma-create-card-icon">+</div>
        <h3 className="ma-create-card-title">Create new app</h3>
        <p className="ma-create-card-sub">Describe an idea. Claude builds the rest.</p>
      </Link>
      {apps.map(a => (
        <AppCardTile key={a.id} app={a} />
      ))}
      {apps.length === 0 && (
        <div
          style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-jakarta)',
          }}
        >
          No apps yet — create your first one!
        </div>
      )}
    </div>
  )
}

function AppCardTile({ app }: { app: AppCard }) {
  return (
    <Link to="/apps/$appId" params={{ appId: app.id }} className="ma-card ma-app-card">
      {app.status === 'draft' && (
        <span className="ma-app-card-status" data-status="draft">
          Draft
        </span>
      )}
      <AppIcon tint={app.tint} glyph={app.glyph} />
      <div>
        <h3 className="ma-app-card-name">{app.name}</h3>
        <p className="ma-app-card-desc" style={{ marginTop: 4 }}>
          {app.description}
        </p>
      </div>
      <div className="ma-app-card-meta">
        <span>{app.category}</span>
        <span className="ma-app-card-meta-dot" />
        <span style={{ textTransform: 'capitalize' }}>{app.status}</span>
      </div>
    </Link>
  )
}

// ── Marketplace view ──────────────────────────────────────────────────

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
      <div className="ma-empty">
        <div className="ma-empty-glyph">◌</div>
        <p>No apps found.</p>
      </div>
    )
  }

  return (
    <>
      {/* Featured hero */}
      <div className="ma-mkt-hero">
        <div className="ma-mkt-hero-card featured" onClick={() => onInstall(hero)}>
          <span className="ma-mkt-hero-tag">{hero.tag ?? 'Featured'}</span>
          <AppIcon tint={hero.tint} glyph={hero.glyph} size="lg" />
          <h2 className="ma-mkt-hero-name">{hero.name}</h2>
          <p className="ma-mkt-hero-desc">{hero.description}</p>
          <div className="ma-mkt-hero-meta">
            <span>by {hero.author}</span>
            <span>·</span>
            <span>★ {hero.rating}</span>
            <span>·</span>
            <span>{hero.installs} installs</span>
          </div>
        </div>
        {others.slice(0, 2).map(a => (
          <div key={a.id} className="ma-mkt-hero-card" onClick={() => onInstall(a)}>
            <span className="ma-mkt-hero-tag">{a.tag ?? 'Featured'}</span>
            <AppIcon tint={a.tint} glyph={a.glyph} size="lg" />
            <h2 className="ma-mkt-hero-name" style={{ fontSize: 18 }}>
              {a.name}
            </h2>
            <p className="ma-mkt-hero-desc" style={{ fontSize: 13 }}>
              {a.description}
            </p>
            <div className="ma-mkt-hero-meta">
              <span>by {a.author}</span>
              <span>·</span>
              <span>★ {a.rating}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trending */}
      {trending.length > 0 && (
        <>
          <div className="ma-section-title">
            Trending this week <small>updated 2 hours ago</small>
          </div>
          <div className="ma-grid">
            {trending.map(a => (
              <div key={a.id} className="ma-card ma-app-card" onClick={() => onInstall(a)}>
                <AppIcon tint={a.tint} glyph={a.glyph} />
                <div>
                  <h3 className="ma-app-card-name">{a.name}</h3>
                  <p className="ma-app-card-desc" style={{ marginTop: 4 }}>
                    {a.description}
                  </p>
                </div>
                <div className="ma-app-card-meta">
                  <span>by {a.author}</span>
                  <span className="ma-app-card-meta-dot" />
                  <span>★ {a.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Browse all */}
      <div className="ma-section-title">
        Browse all <small>{apps.length} apps</small>
      </div>
      <div className="ma-store-grid">
        {apps.map(a => (
          <div key={a.id} className="ma-store-row" onClick={() => onInstall(a)}>
            <AppIcon tint={a.tint} glyph={a.glyph} size="lg" />
            <div>
              <h4 className="ma-store-row-name">{a.name}</h4>
              <p className="ma-store-row-sub">{a.description}</p>
              <div className="ma-store-row-rating">
                ★ {a.rating} · {a.installs} installs
              </div>
            </div>
            <button
              className="ma-btn ma-btn-secondary ma-btn-sm"
              onClick={e => {
                e.stopPropagation()
                onInstall(a)
              }}
            >
              Add
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
