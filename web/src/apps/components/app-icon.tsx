import type { AppTint } from '../data'

type AppIconSize = 'sm' | 'md' | 'lg' | 'xl'

type Props = {
  tint: AppTint
  glyph: string
  size?: AppIconSize
}

export function AppIcon({ tint, glyph, size = 'md' }: Props) {
  const cls = [
    'ma-app-icon',
    `tint-${tint}`,
    size === 'sm' ? 'ma-app-icon-sm' : '',
    size === 'lg' ? 'ma-app-icon-lg' : '',
    size === 'xl' ? 'ma-app-icon-xl' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={cls}>{glyph}</div>
}
