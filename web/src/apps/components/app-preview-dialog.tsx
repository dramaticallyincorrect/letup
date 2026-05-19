import type { MarketplaceListing } from '@repo/data'
import { AppIcon } from './app-icon'
import { getAppTint, getAppGlyph } from '../data'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { DownloadIcon, XIcon, StarIcon } from 'lucide-react'

type Props = {
  listing: MarketplaceListing | null
  onClose: () => void
  onInstall: (listing: MarketplaceListing) => void
  installing?: boolean
  installDisabled?: boolean
}

export function AppPreviewDialog({ listing, onClose, onInstall, installing, installDisabled }: Props) {
  const tint = listing ? getAppTint(listing.appId) : 'indigo'
  const glyph = listing ? getAppGlyph(listing.appName) : ''

  return (
    <Dialog open={!!listing} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[560px] gap-0 p-0 overflow-hidden rounded-[var(--radius-xl)]"
      >
        <DialogTitle className="sr-only">{listing?.appName ?? 'App preview'}</DialogTitle>
        <DialogDescription className="sr-only">{listing?.description}</DialogDescription>

        {/* Screenshot previews */}
        <div className="flex gap-3 p-4 bg-secondary/50 border-b overflow-x-auto">
          <img
            src="https://placehold.co/240x420/e8e8e8/aaaaaa?text=Screenshot+1"
            alt="App screenshot 1"
            className="h-[260px] w-auto rounded-xl border shadow-sm shrink-0 object-cover"
          />
          <img
            src="https://placehold.co/240x420/e8e8e8/aaaaaa?text=Screenshot+2"
            alt="App screenshot 2"
            className="h-[260px] w-auto rounded-xl border shadow-sm shrink-0 object-cover"
          />
        </div>

        {/* App details */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <AppIcon tint={tint} glyph={glyph} size="sm" />
              <div>
                <h2 className="text-[17px] font-bold tracking-tight text-foreground leading-tight">
                  {listing?.appName}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  by {listing?.appCreatorHandle}
                </p>
              </div>
            </div>
            {listing?.avgRating != null && (
              <div className="flex items-center gap-1 text-[13px] font-medium text-amber-500 shrink-0 mt-0.5">
                <StarIcon size={13} fill="currentColor" />
                {listing.avgRating.toFixed(1)}
              </div>
            )}
          </div>

          <p className="text-[13.5px] leading-relaxed text-muted-foreground mt-3">
            {listing?.description}
          </p>

          {listing && listing.totalInstalls > 0 && (
            <p className="text-[12px] text-muted-foreground mt-2">
              {listing.totalInstalls.toLocaleString()} installs
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 px-5 py-3 flex items-center justify-end gap-2 border-t bg-muted/40 rounded-b-[var(--radius-xl)]">
          <DialogClose asChild>
            <Button variant="outline" size="sm">Close</Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => listing && onInstall(listing)}
            disabled={installing || !listing || installDisabled}
            title={installDisabled ? 'Free plan allows 3 apps — uninstall one or upgrade to Pro' : undefined}
          >
            <DownloadIcon size={14} />
            {installing ? 'Installing…' : 'Install app'}
          </Button>
        </div>

        {/* Close X */}
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3 z-10 bg-background/60 hover:bg-background/80 backdrop-blur-sm"
          >
            <XIcon size={16} />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
