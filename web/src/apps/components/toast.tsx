import { useEffect } from 'react'

type Props = {
  message: string | null
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 2400)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className="ma-toast">
      <span className="ma-toast-glyph">✓</span>
      <span>{message}</span>
    </div>
  )
}
