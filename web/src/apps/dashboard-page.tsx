import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as client from '@repo/data'
import { MARKETPLACE_CATEGORIES } from '@repo/data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome } from './components/chrome'
import { AppIcon } from './components/app-icon'
import { Modal } from './components/modal'
import { Toast } from './components/toast'
import { getAppTint, getAppGlyph } from './data'

type SubmitModalState = {
  appId: string
  appName: string
  existingDescription?: string
  existingCategory?: string
}


export function DashboardPage() {
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<string | null>(null)
  const [submitModal, setSubmitModal] = useState<SubmitModalState | null>(null)

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: client.getUser,
  })

  const { data: apps = [], isPending } = useQuery({
    queryKey: ['created-apps'],
    queryFn: client.getCreatedApps,
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ['dashboard-submissions'],
    queryFn: client.getMySubmissions,
  })

  const submissionByApp = Object.fromEntries(
    submissions.map(s => [s.appId, s]),
  )

  function openSubmitModal(app: client.CreatedAppSummary) {
    if (app.isDraft !== false) return
    const sub = submissionByApp[app.id]
    setSubmitModal({
      appId: app.id,
      appName: app.name,
      existingDescription: sub?.description ?? app.description,
      existingCategory: sub?.category,
    })
  }

  async function handleSubmitted() {
    await queryClient.invalidateQueries({ queryKey: ['dashboard-submissions'] })
    setToast(`"${submitModal?.appName}" submitted to app store`)
    setSubmitModal(null)
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="dashboard" />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8">
        <div className="mb-9">
          <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
            Your <span className="text-accent">Dashboard</span>
          </h1>
          <p className="text-[15px] text-muted-foreground m-0">
            Manage and publish your apps to the app store
          </p>
        </div>

        {isPending ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-[32px] mb-2 text-foreground/30">◌</div>
            <p>Loading your apps…</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>No apps yet — create your first one!</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">App</th>
                  <th className=" px-5 py-3 font-semibold text-center text-muted-foreground">Submission</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {apps.map((app, i) => {
                  const submission = submissionByApp[app.id]
                  const tint = getAppTint(app.id)
                  const glyph = getAppGlyph(app.name)
                  const isApproved = submission?.status === 'approved'
                  const isPending = submission?.status === 'pending'
                  const canSubmit = app.isDraft === false && !isApproved

                  return (
                    <tr
                      key={app.id}
                      className={cn(
                        'border-b border-border last:border-0',
                        i % 2 === 0 ? 'bg-background' : 'bg-secondary/20',
                      )}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <AppIcon tint={tint} glyph={glyph} size="sm" />
                          <div>
                            <div className="font-semibold text-foreground">{app.name}</div>
                            {app.description && (
                              <div className="text-[12px] text-muted-foreground line-clamp-1 max-w-90">
                                {app.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 items-center text-center">
                        {isApproved && (
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-semibold"
                            style={{ background: 'var(--tint-indigo-bg)', color: 'var(--tint-indigo-fg)' }}
                          >
                            Published
                          </Badge>
                        )}
                        {isPending && (
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-semibold"
                            style={{ background: 'var(--tint-amber-bg)', color: 'var(--tint-amber-fg)' }}
                          >
                            Pending review
                          </Badge>
                        )}
                        {!submission && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user?.isAdmin && (
                            <Button size="sm" variant="ghost" asChild>
                              <Link to="/apps/$appId/usage" params={{ appId: app.id }}>
                                Usage
                              </Link>
                            </Button>
                          )}
                          {isApproved ? (
                            <span className="text-[12px] text-muted-foreground">In app store</span>
                          ) : (
                            <Button
                              size="sm"
                              variant={canSubmit ? 'default' : 'ghost'}
                              disabled={!canSubmit}
                              onClick={() => openSubmitModal(app)}
                            >
                              {app.isDraft !== false ? 'Draft — publish first' : isPending ? 'Resubmit' : 'Submit to app store'}
                            </Button>
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

      {submitModal && (
        <SubmitModal
          appId={submitModal.appId}
          appName={submitModal.appName}
          initialDescription={submitModal.existingDescription ?? ''}
          initialCategory={submitModal.existingCategory ?? ''}
          onClose={() => setSubmitModal(null)}
          onSubmitted={handleSubmitted}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}


function SubmitModal({
  appId,
  appName,
  initialDescription,
  initialCategory,
  onClose,
  onSubmitted,
}: {
  appId: string
  appName: string
  initialDescription: string
  initialCategory: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const [category, setCategory] = useState(initialCategory || MARKETPLACE_CATEGORIES[0])
  const [description, setDescription] = useState(initialDescription)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!description.trim()) {
      setError('Please add a description.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await client.submitApp(appId, { category, description: description.trim() })
      onSubmitted()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<>Submit "{appName}" to app store</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[13px] font-semibold text-foreground mb-1.5">
            Category
          </label>
          <select
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground outline-none focus:border-ring transition-colors cursor-pointer"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {MARKETPLACE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-foreground mb-1.5">
            Description
          </label>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground outline-none focus:border-ring transition-colors resize-none placeholder:text-muted-foreground"
            rows={4}
            placeholder="Describe what your app does and who it's for…"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-[13px] text-destructive">{error}</p>
        )}
      </div>
    </Modal>
  )
}
