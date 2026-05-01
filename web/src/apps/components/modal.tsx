import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: Props) {
  if (!open) return null

  return (
    <div className="ma-modal-backdrop" onClick={onClose}>
      <div className="ma-modal" onClick={e => e.stopPropagation()}>
        <div className="ma-modal-header">
          <h3 className="ma-modal-title">{title}</h3>
        </div>
        <div className="ma-modal-body">{children}</div>
        <div className="ma-modal-footer">{footer}</div>
      </div>
    </div>
  )
}
