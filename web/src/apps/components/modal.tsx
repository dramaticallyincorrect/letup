import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[480px] gap-0 p-0 overflow-hidden rounded-[var(--radius-xl)]"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[19px] font-bold tracking-tight flex items-center gap-3">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
        <DialogFooter className="px-5 py-3 -mx-0 -mb-0 rounded-b-[var(--radius-xl)] justify-end gap-2">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
