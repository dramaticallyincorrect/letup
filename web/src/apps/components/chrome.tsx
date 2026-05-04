import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TINT_STYLES } from './app-icon'

type Props = {
  active: 'library' | 'marketplace' | 'create'
  search?: string
  onSearch?: (v: string) => void
}

export function Chrome({ active, search = '', onSearch }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl font-sans" style={{ backdropFilter: 'blur(20px) saturate(140%)' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-4 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-[17px] tracking-[-0.015em] text-foreground no-underline">
          <span
            className="size-[26px] rounded-lg grid place-items-center text-sm font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            m
          </span>
          <span>mini</span>
        </Link>

        <nav className="flex gap-0.5 ml-2">
          <Link
            to="/"
            className={cn(
              'px-3.5 py-[7px] rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors no-underline',
              active === 'library' && 'text-foreground bg-secondary',
            )}
          >
            My apps
          </Link>
          <Link
            to="/marketplace"
            className={cn(
              'px-3.5 py-[7px] rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors no-underline',
              active === 'marketplace' && 'text-foreground bg-secondary',
            )}
          >
            Marketplace
          </Link>
          <Link
            to="/create"
            className={cn(
              'px-3.5 py-[7px] rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors no-underline',
              active === 'create' && 'text-foreground bg-secondary',
            )}
          >
            Create
          </Link>
        </nav>

        <div className="flex-1" />

        <label className="flex items-center gap-2 w-[280px] h-9 px-3.5 bg-secondary rounded-full border border-transparent focus-within:border-input focus-within:bg-card transition-colors cursor-text max-[900px]:w-[160px]">
          <span className="text-[13px] text-muted-foreground">⌕</span>
          <input
            className="flex-1 min-w-0 h-full bg-transparent border-0 text-sm text-foreground outline-none placeholder:text-muted-foreground font-sans"
            placeholder="Search apps…"
            value={search}
            onChange={e => onSearch?.(e.target.value)}
          />
          <kbd className="font-sans text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-card text-muted-foreground border border-border">
            ⌘K
          </kbd>
        </label>

        <Button asChild size="sm">
          <Link to="/create">
            <span className="text-sm leading-none">+</span> New app
          </Link>
        </Button>

        <div
          className="size-8 rounded-full grid place-items-center font-bold text-xs shrink-0"
          style={TINT_STYLES.coral}
          title="You"
        >
          You
        </div>
      </div>
    </header>
  )
}
