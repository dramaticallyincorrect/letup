import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import type { MarketplaceListing } from '@repo/data'
import { Card, CardContent } from '@/components/ui/card'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { Toast } from './components/toast'
import { AppPreviewDialog } from './components/app-preview-dialog'
import {
  CATEGORIES,
  getAppTint,
  getAppGlyph,
} from './data'
import { Button } from '@/components/ui/button'
import { SearchIcon } from 'lucide-react'

export function MarketplacePage() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)
  const [installing, setInstalling] = useState(false)

  const { data: listings = [] } = useQuery({
    queryKey: ['marketplace-listings'],
    queryFn: client.getMarketplaceListings,
  })

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase()
    return listings.filter(l => {
      if (category !== 'All' && l.category !== category) return false
      if (q && !`${l.appName} ${l.description}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [listings, search, category])

  async function handleInstallListing(listing: MarketplaceListing) {
    setInstalling(true)
    try {
      await client.installMarketplaceListing(listing.appId)
      setToast(`${listing.appName} added to your apps`)
      setSelectedListing(null)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="marketplace" />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8 max-[900px]:pb-20">
        <div className="flex items-end justify-between gap-6 mb-9">
          <div>
            <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
              The <span className="text-accent not-italic">marketplace</span>
            </h1>
            <p className="text-[15px] text-muted-foreground m-0">
              Hand-picked apps built by the community
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 mb-5.5 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.slice(0, 7).map(c => (
              <Button
                key={c}
                variant={category == c ? 'default' : 'outline'}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
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

        {filteredListings.length === 0 ? (
          <div className="text-center py-20 px-5 text-muted-foreground">
            <div className="text-[32px] mb-2 text-foreground/30">◌</div>
            <p>No apps found.</p>
          </div>
        ) : (
          <div className="grid gap-4.5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-[900px]:grid-cols-[repeat(2,1fr)]">
            {filteredListings.map(l => {
              const tint = getAppTint(l.appId)
              const glyph = getAppGlyph(l.appName)
              return (
                <Card
                  key={l.id}
                  className="hover:shadow-(--shadow-md) transition-all cursor-pointer p-0 gap-0"
                  onClick={() => setSelectedListing(l)}
                >
                  <CardContent className="p-5 flex flex-col gap-4">
                    <AppIcon tint={tint} glyph={glyph} />
                    <div>
                      <h3 className="font-bold text-base text-foreground tracking-[-0.01em] m-0">{l.appName}</h3>
                      <p className="text-[13.5px] leading-normal text-muted-foreground mt-1 line-clamp-2 m-0">
                        {l.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground font-medium mt-auto">
                      <span>by {l.appCreatorHandle}</span>
                      {l.totalInstalls > 0 && (
                        <>
                          <span className="size-0.75 rounded-full bg-current opacity-50" />
                          <span>{l.totalInstalls.toLocaleString()} installs</span>
                        </>
                      )}
                      <Button variant='secondary' size='xs' className="ml-auto" onClick={e => { e.stopPropagation(); handleInstallListing(l) }}>
                        Install
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      <AppPreviewDialog
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
        onInstall={handleInstallListing}
        installing={installing}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
