import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import * as client from '@repo/data'
import type { AdminApp } from '@repo/data'
import Editor from '@monaco-editor/react'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { getAppTint, getAppGlyph } from './data'
import { FileIcon, FolderIcon, FolderOpenIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function getLanguage(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.jsx')) return 'typescript'
  if (path.endsWith('.ts') || path.endsWith('.js')) return 'typescript'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.md')) return 'markdown'
  return 'plaintext'
}

// ── File tree ─────────────────────────────────────────────────────────────────

type TreeNode =
  | { kind: 'file'; name: string; path: string }
  | { kind: 'dir'; name: string; children: TreeNode[] }

function buildTree(files: Array<{ path: string; content: string }>): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let nodes = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i === parts.length - 1) {
        nodes.push({ kind: 'file', name: part, path: file.path })
      } else {
        let dir = nodes.find((n): n is Extract<TreeNode, { kind: 'dir' }> => n.kind === 'dir' && n.name === part)
        if (!dir) {
          dir = { kind: 'dir', name: part, children: [] }
          nodes.push(dir)
        }
        nodes = dir.children
      }
    }
  }

  return root
}

function FileTree({
  nodes,
  depth,
  activeFilePath,
  onSelect,
  collapsed,
  onToggle,
}: {
  nodes: TreeNode[]
  depth: number
  activeFilePath: string | null
  onSelect: (path: string) => void
  collapsed: Set<string>
  onToggle: (dirPath: string) => void
}) {
  return (
    <>
      {nodes.map(node => {
        const indent = depth * 12

        if (node.kind === 'file') {
          const isActive = node.path === activeFilePath
          return (
            <button
              key={node.path}
              onClick={() => onSelect(node.path)}
              style={{ paddingLeft: 12 + indent }}
              className={cn(
                'w-full flex items-center gap-1.5 pr-3 py-1 text-left transition-colors text-xs',
                isActive
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
              )}
            >
              <FileIcon className="w-3 h-3 shrink-0 opacity-60" />
              <span className="truncate font-mono">{node.name}</span>
            </button>
          )
        }

        // Build a stable key for the dir node by joining path segments
        const dirKey = node.name + depth
        const isCollapsed = collapsed.has(dirKey)

        return (
          <div key={dirKey}>
            <button
              onClick={() => onToggle(dirKey)}
              style={{ paddingLeft: 8 + indent }}
              className="w-full flex items-center gap-1.5 pr-3 py-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRightIcon className={cn('w-3 h-3 shrink-0 transition-transform', !isCollapsed && 'rotate-90')} />
              {isCollapsed
                ? <FolderIcon className="w-3 h-3 shrink-0 opacity-60" />
                : <FolderOpenIcon className="w-3 h-3 shrink-0 opacity-60" />
              }
              <span className="truncate font-mono font-medium">{node.name}</span>
            </button>
            {!isCollapsed && (
              <FileTree
                nodes={node.children}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onSelect={onSelect}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export function AdminAppsPage() {
  const navigate = useNavigate()

  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDrafts, setShowDrafts] = useState(false)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())

  const { data: user, isPending: userPending } = useQuery({
    queryKey: ['me'],
    queryFn: client.getUser,
  })

  const { data: apps = [], isPending: appsPending } = useQuery({
    queryKey: ['admin-apps'],
    queryFn: client.getAdminApps,
    enabled: !!user?.isAdmin,
  })

  if (!userPending && user && !user.isAdmin) {
    navigate({ to: '/home' })
    return null
  }

  const selectedApp = apps.find(a => a.id === selectedAppId) ?? null
  const sourceFiles = selectedApp?.sourceFiles ?? []
  const activeFile = sourceFiles.find(f => f.path === selectedFile) ?? sourceFiles[0] ?? null

  function selectApp(app: AdminApp) {
    setSelectedAppId(app.id)
    setCollapsedDirs(new Set())
    const files = app.sourceFiles ?? []
    setSelectedFile(files[0]?.path ?? null)
  }

  function toggleDir(dirKey: string) {
    setCollapsedDirs(prev => {
      const next = new Set(prev)
      next.has(dirKey) ? next.delete(dirKey) : next.add(dirKey)
      return next
    })
  }

  const fileTree = buildTree(sourceFiles)

  const filteredApps = apps.filter(app => {
    if (!showDrafts && app.isDraft) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)
    }
    return true
  })

  const isPending = userPending || appsPending

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col">
      <Chrome active="dashboard" />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* App list sidebar */}
        <div className="w-72 border-r border-border flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">All Apps</h2>
              <span className="text-xs text-muted-foreground">{filteredApps.length}</span>
            </div>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-secondary border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                role="switch"
                aria-checked={showDrafts}
                onClick={() => setShowDrafts(v => !v)}
                className={cn(
                  'relative w-7 h-4 rounded-full transition-colors shrink-0',
                  showDrafts ? 'bg-primary' : 'bg-border',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                  showDrafts && 'translate-x-3',
                )} />
              </div>
              <span className="text-xs text-muted-foreground">Show drafts</span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isPending ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                Loading…
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {search ? 'No matches' : 'No apps yet'}
              </div>
            ) : (
              filteredApps.map(app => {
                const tint = getAppTint(app.id)
                const glyph = getAppGlyph(app.name)
                const isSelected = app.id === selectedAppId
                const fileCount = app.sourceFiles?.length ?? 0

                return (
                  <button
                    key={app.id}
                    onClick={() => selectApp(app)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50',
                      isSelected
                        ? 'bg-secondary text-foreground'
                        : 'hover:bg-secondary/50 text-foreground',
                    )}
                  >
                    <AppIcon tint={tint} glyph={glyph} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{app.name}</span>
                        {app.isDraft && (
                          <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">draft</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        v{app.latestVersionNumber} · {fileCount} file{fileCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {isSelected && (
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* File tree + editor */}
        {selectedApp ? (
          <div className="flex flex-1 overflow-hidden">
            {/* File tree */}
            <div className="w-56 border-r border-border flex flex-col shrink-0 overflow-hidden bg-secondary/20">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Source Files
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {sourceFiles.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No source files</p>
                ) : (
                  <FileTree
                    nodes={fileTree}
                    depth={0}
                    activeFilePath={activeFile?.path ?? null}
                    onSelect={setSelectedFile}
                    collapsed={collapsedDirs}
                    onToggle={toggleDir}
                  />
                )}
              </div>
            </div>

            {/* Monaco editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeFile ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
                    <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-mono text-muted-foreground">{activeFile.path}</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Editor
                      height="100%"
                      language={getLanguage(activeFile.path)}
                      value={activeFile.content}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        fontSize: 13,
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        renderLineHighlight: 'line',
                        padding: { top: 16, bottom: 16 },
                        overviewRulerLanes: 0,
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  No source files for this app version
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select an app to view its source files
          </div>
        )}
      </div>
    </div>
  )
}
