import { useState } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import { microUnitsToUsd } from '@repo/data'
import { Badge } from '@/components/ui/badge'
import { Chrome } from './components/chrome'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UsagePage() {
  const { appId } = useParams({ from: '/protected/apps/$appId/usage' })
  const navigate = useNavigate()
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())

  const { data: user, isPending: userPending } = useQuery({
    queryKey: ['me'],
    queryFn: client.getUser,
  })

  const { data: versions = [], isPending: versionsPending } = useQuery({
    queryKey: ['app-usage', appId],
    queryFn: () => client.getAppUsage(appId),
    enabled: !!user?.isAdmin,
  })

  const { data: app } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => client.getApp(appId),
    enabled: !!user?.isAdmin,
  })

  if (!userPending && user && !user.isAdmin) {
    navigate({ to: '/home' })
    return null
  }

  const isPending = userPending || versionsPending

  function toggleVersion(versionId: string) {
    setExpandedVersions(prev => {
      const next = new Set(prev)
      if (next.has(versionId)) next.delete(versionId)
      else next.add(versionId)
      return next
    })
  }

  const grandTotalMicroUnits = versions.reduce((sum, v) => sum + BigInt(v.totalMicroUnitsUsed), 0n)
  const grandTotalInput = versions.reduce((sum, v) => sum + v.totalInputTokens, 0)
  const grandTotalOutput = versions.reduce((sum, v) => sum + v.totalOutputTokens, 0)
  const grandTotalCache = versions.reduce(
    (sum, v) => sum + v.totalCacheCreationTokens + v.totalCacheReadTokens,
    0,
  )

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="dashboard" />

      <main className="max-w-5xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8">
        <div className="mb-9">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground mb-3">
            <Link to="/dashboard" className="hover:text-foreground transition-colors no-underline">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground">{app?.name ?? '…'}</span>
            <span>/</span>
            <span>Usage</span>
          </div>
          <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
            Token <span className="text-accent">Usage</span>
          </h1>
          <p className="text-[15px] text-muted-foreground m-0">
            Per-version breakdown of AI token consumption and cost
          </p>
        </div>

        {isPending ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-[32px] mb-2 text-foreground/30">◌</div>
            <p>Loading usage data…</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <p className="text-[15px]">No usage data yet — build your app to see token stats.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Grand total banner */}
            <div className="flex items-center justify-between px-6 py-4 rounded-xl border border-border bg-secondary/20">
              <div>
                <div className="text-[13px] text-muted-foreground mb-0.5">Total across all versions</div>
                <div className="text-[22px] font-bold text-foreground">
                  {microUnitsToUsd(grandTotalMicroUnits.toString())}
                </div>
              </div>
              <div className="flex gap-8 text-right">
                <div>
                  <div className="text-[12px] text-muted-foreground mb-0.5">Input</div>
                  <div className="text-[15px] font-semibold tabular-nums">{grandTotalInput.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground mb-0.5">Output</div>
                  <div className="text-[15px] font-semibold tabular-nums">{grandTotalOutput.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground mb-0.5">Cache</div>
                  <div className="text-[15px] font-semibold tabular-nums">{grandTotalCache.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground mb-0.5">Messages</div>
                  <div className="text-[15px] font-semibold tabular-nums">
                    {versions.reduce((s, v) => s + v.builds.length, 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-version accordion */}
            {versions.map(v => {
              const isExpanded = expandedVersions.has(v.appVersionId)
              const versionCache = v.totalCacheCreationTokens + v.totalCacheReadTokens

              return (
                <div key={v.appVersionId} className="border border-border rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center gap-4 px-6 py-4 bg-secondary/10 hover:bg-secondary/30 transition-colors text-left"
                    onClick={() => toggleVersion(v.appVersionId)}
                  >
                    {isExpanded
                      ? <ChevronDownIcon className="size-4 text-muted-foreground shrink-0" />
                      : <ChevronRightIcon className="size-4 text-muted-foreground shrink-0" />
                    }
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="font-semibold text-[15px] text-foreground">
                        Version {v.versionNumber}
                      </span>
                      {v.isDraft && (
                        <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                      )}
                      <span className="text-[13px] text-muted-foreground">
                        {v.builds.length} message{v.builds.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-8 text-right shrink-0">
                      <div className="hidden sm:block">
                        <div className="text-[11px] text-muted-foreground">Input</div>
                        <div className="text-[13px] font-medium tabular-nums">{v.totalInputTokens.toLocaleString()}</div>
                      </div>
                      <div className="hidden sm:block">
                        <div className="text-[11px] text-muted-foreground">Output</div>
                        <div className="text-[13px] font-medium tabular-nums">{v.totalOutputTokens.toLocaleString()}</div>
                      </div>
                      <div className="hidden sm:block">
                        <div className="text-[11px] text-muted-foreground">Cache</div>
                        <div className="text-[13px] font-medium tabular-nums">{versionCache.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Cost</div>
                        <div className="text-[15px] font-bold text-foreground">{microUnitsToUsd(v.totalMicroUnitsUsed)}</div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b border-border bg-background">
                            <th className="text-left px-6 py-2.5 font-semibold text-muted-foreground">Message</th>
                            <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Model</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Input</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Output</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Cache</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Duration</th>
                            <th className="text-right px-6 py-2.5 font-semibold text-muted-foreground">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.builds.map((b, i) => (
                            <tr
                              key={b.buildSessionId}
                              className={cn(
                                'border-b border-border last:border-0',
                                i % 2 === 0 ? 'bg-background' : 'bg-secondary/10',
                              )}
                            >
                              <td className="px-6 py-3 max-w-[280px]">
                                <span
                                  className="block truncate text-foreground"
                                  title={b.userMessage ?? ''}
                                >
                                  {b.userMessage ?? <span className="text-muted-foreground italic">—</span>}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{b.model}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{b.inputTokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{b.outputTokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                {(b.cacheCreationTokens + b.cacheReadTokens).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                {b.durationSeconds != null ? `${b.durationSeconds.toFixed(1)}s` : '—'}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums font-semibold">
                                {microUnitsToUsd(b.microUnitsUsed)}
                              </td>
                            </tr>
                          ))}
                          {/* Version total row */}
                          <tr className="bg-secondary/20 border-t border-border">
                            <td className="px-6 py-2.5 font-semibold text-foreground" colSpan={2}>
                              Version total
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{v.totalInputTokens.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{v.totalOutputTokens.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-muted-foreground">
                              {versionCache.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-muted-foreground">
                              {v.builds.reduce((s, b) => s + (b.durationSeconds ?? 0), 0).toFixed(1)}s
                            </td>
                            <td className="px-6 py-2.5 text-right tabular-nums font-bold">
                              {microUnitsToUsd(v.totalMicroUnitsUsed)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
