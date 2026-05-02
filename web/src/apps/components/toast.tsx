import { useEffect } from 'react'
import { toast } from 'sonner'

type Props = {
  message: string | null
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return
    toast.success(message, { duration: 2400 })
    const t = setTimeout(onDismiss, 2400)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return null
}
