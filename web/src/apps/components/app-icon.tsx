import { cn } from '@/lib/utils'
import type { AppTint } from '../data'

type AppIconSize = 'sm' | 'md' | 'lg' | 'xl'

type Props = {
  tint: AppTint
  glyph: string
  size?: AppIconSize
}

const TINT_STYLES: Record<AppTint, { background: string; color: string }> = {
  coral:    { background: 'var(--tint-coral-bg)',    color: 'var(--tint-coral-fg)' },
  sage:     { background: 'var(--tint-sage-bg)',     color: 'var(--tint-sage-fg)' },
  indigo:   { background: 'var(--tint-indigo-bg)',   color: 'var(--tint-indigo-fg)' },
  amber:    { background: 'var(--tint-amber-bg)',    color: 'var(--tint-amber-fg)' },
  plum:     { background: 'var(--tint-plum-bg)',     color: 'var(--tint-plum-fg)' },
  graphite: { background: 'var(--tint-graphite-bg)', color: 'var(--tint-graphite-fg)' },
  sky:      { background: 'var(--tint-sky-bg)',      color: 'var(--tint-sky-fg)' },
  mint:     { background: 'var(--tint-mint-bg)',     color: 'var(--tint-mint-fg)' },
}

export { TINT_STYLES }

const SIZE_CLASS: Record<AppIconSize, string> = {
  sm: 'size-[34px] rounded-[9px] text-[16px]',
  md: 'size-12 rounded-xl text-[22px]',
  lg: 'size-[60px] rounded-2xl text-[28px]',
  xl: 'size-[76px] rounded-[18px] text-[34px]',
}

export function AppIcon({ tint, glyph, size = 'md' }: Props) {
  return (
    <div
      className={cn('grid place-items-center shrink-0 font-medium', SIZE_CLASS[size])}
      style={TINT_STYLES[tint]}
    >
      {glyph}
    </div>
  )
}
