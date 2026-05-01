import { Link } from '@tanstack/react-router'

type Props = {
  active: 'library' | 'create'
  search?: string
  onSearch?: (v: string) => void
}

export function Chrome({ active, search = '', onSearch }: Props) {
  return (
    <header className="ma-chrome">
      <div className="ma-chrome-inner">
        <Link to="/" className="ma-brand">
          <span className="ma-brand-mark">m</span>
          <span>mini</span>
        </Link>

        <nav className="ma-chrome-tabs">
          <Link
            to="/"
            className="ma-chrome-tab"
            data-active={active === 'library' ? '1' : '0'}
          >
            My apps
          </Link>
          <Link
            to="/create"
            className="ma-chrome-tab"
            data-active={active === 'create' ? '1' : '0'}
          >
            Create
          </Link>
        </nav>

        <div className="ma-chrome-spacer" />

        <label className="ma-chrome-search">
          <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>⌕</span>
          <input
            placeholder="Search apps…"
            value={search}
            onChange={e => onSearch?.(e.target.value)}
          />
          <kbd>⌘K</kbd>
        </label>

        <Link to="/create" className="ma-btn ma-btn-primary ma-btn-sm">
          <span style={{ fontSize: 14, marginTop: -1 }}>+</span> New app
        </Link>

        <div className="ma-avatar" title="You">
          You
        </div>
      </div>
    </header>
  )
}
