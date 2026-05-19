import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import * as client from '@repo/data'
import type { SubmissionStatus } from '@repo/data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome } from './components/chrome'
import { Toast } from './components/toast'
import { AppIcon } from './components/app-icon'
import { getAppTint, getAppGlyph } from './data'

type FilterTab = 'all' | SubmissionStatus

const TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

export function AdminPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<FilterTab>('pending')
  const [toast, setToast] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const { data: user, isPending: userPending } = useQuery({
    queryKey: ['me'],
    queryFn: client.getUser,
  })

  const { data: submissions = [], isPending: subsPending } = useQuery({
    queryKey: ['admin-submissions'],
    queryFn: client.getAdminSubmissions,
    enabled: !!user?.isAdmin,
  })

  if (!userPending && user && !user.isAdmin) {
    navigate({ to: '/home' })
    return null
  }

  const filtered = tab === 'all' ? submissions : submissions.filter(s => s.status === tab)

  async function handleApprove(submissionId: string, appName: string) {
    setActing(submissionId)
    try {
      await client.approveSubmission(submissionId)
      await queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
      setToast(`"${appName}" approved and published to marketplace`)
    } catch {
      setToast('Failed to approve submission')
    } finally {
      setActing(null)
    }
  }

  async function handleReject(submissionId: string, appName: string) {
    setActing(submissionId)
    try {
      await client.rejectSubmission(submissionId)
      await queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
      setToast(`"${appName}" submission rejected`)
    } catch {
      setToast('Failed to reject submission')
    } finally {
      setActing(null)
    }
  }

  const isPending = userPending || subsPending

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="dashboard" />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8">
        <div className="mb-9">
          <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
            <span className="text-accent">Admin</span> — Submissions
          </h1>
          <p className="text-[15px] text-muted-foreground m-0">
            Review and approve or reject marketplace submissions
          </p>
        </div>

        <div className="flex gap-1 mb-6">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                tab === t.value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              {t.label}
              {t.value !== 'all' && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {submissions.filter(s => s.status === t.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {isPending ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-[32px] mb-2 text-foreground/30">◌</div>
            <p>Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>No {tab === 'all' ? '' : tab + ' '}submissions.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">App</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Submitter</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Category</th>
                  <th className="text-center px-5 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Submitted</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub, i) => {
                  const tint = getAppTint(sub.appId)
                  const glyph = getAppGlyph(sub.appName)
                  const isActing = acting === sub.id

                  return (
                    <tr
                      key={sub.id}
                      className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <AppIcon tint={tint} glyph={glyph} size="sm" />
                          <div>
                            <div className="font-semibold text-foreground">{sub.appName}</div>
                            {sub.description && (
                              <div className="text-[12px] text-muted-foreground line-clamp-1 max-w-72">
                                {sub.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">@{sub.submitterHandle}</td>
                      <td className="px-5 py-4 text-muted-foreground">{sub.category}</td>
                      <td className="px-5 py-4 text-center">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-[12px]">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/admin/submissions/$submissionId" params={{ submissionId: sub.id }}>
                              View
                            </Link>
                          </Button>
                          {sub.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isActing}
                                onClick={() => handleReject(sub.id, sub.appName)}
                                className="text-destructive hover:text-destructive"
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                disabled={isActing}
                                onClick={() => handleApprove(sub.id, sub.appName)}
                              >
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  if (status === 'approved') {
    return (
      <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-indigo-bg)', color: 'var(--tint-indigo-fg)' }}>
        Approved
      </Badge>
    )
  }
  if (status === 'pending') {
    return (
      <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-amber-bg)', color: 'var(--tint-amber-fg)' }}>
        Pending
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-coral-bg)', color: 'var(--tint-coral-fg)' }}>
      Rejected
    </Badge>
  )
}
