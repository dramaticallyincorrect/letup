import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import * as client from '@repo/data'
import type { SafeHistoryEntry } from '@repo/data'
import { Badge } from '@/components/ui/badge'
import { Chrome } from './components/chrome'
import { ArrowLeftIcon, FileIcon, MessageSquareIcon, BotIcon, HelpCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AdminSubmissionPage() {
  const { submissionId } = useParams({ from: '/protected/admin/submissions/$submissionId' })
  const navigate = useNavigate()

  const { data: user, isPending: userPending } = useQuery({
    queryKey: ['me'],
    queryFn: client.getUser,
  })

  const { data, isPending, isError } = useQuery({
    queryKey: ['submission-history', submissionId],
    queryFn: () => client.getSubmissionHistory(submissionId),
    enabled: !!user?.isAdmin,
  })

  if (!userPending && user && !user.isAdmin) {
    navigate({ to: '/home' })
    return null
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="dashboard" />

      <main className="max-w-3xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 no-underline"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to submissions
        </Link>

        {isPending || userPending ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-[32px] mb-2 text-foreground/30">◌</div>
            <p>Loading…</p>
          </div>
        ) : isError ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>Failed to load history.</p>
          </div>
        ) : data ? (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-[28px] font-bold tracking-tight text-foreground leading-none">
                  {data.appName}
                </h1>
                <StatusBadge status={data.status} />
              </div>
              <p className="text-[14px] text-muted-foreground">
                by @{data.submitterHandle} · {data.category} · submitted {new Date(data.createdAt).toLocaleDateString()}
              </p>
              {data.description && (
                <p className="mt-3 text-[14px] text-foreground/80 leading-relaxed">{data.description}</p>
              )}
            </div>

            <div className="border-t border-border pt-8">
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-6">
                Build conversation
              </h2>

              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conversation history available.</p>
              ) : (
                <div className="space-y-3">
                  {data.history.map((entry, i) => (
                    <HistoryEntry key={i} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

function HistoryEntry({ entry }: { entry: SafeHistoryEntry }) {
  if (entry.kind === 'user_message') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] bg-accent/15 border border-accent/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-[14px] text-foreground whitespace-pre-wrap leading-relaxed">{entry.text}</p>
        </div>
        <div className="size-7 rounded-full bg-secondary border border-border shrink-0 grid place-items-center mt-0.5">
          <MessageSquareIcon className="size-3.5 text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (entry.kind === 'assistant_text') {
    return (
      <div className="flex gap-3">
        <div className="size-7 rounded-full bg-accent/20 border border-accent/30 shrink-0 grid place-items-center mt-0.5">
          <BotIcon className="size-3.5 text-accent" />
        </div>
        <div className="max-w-[80%] bg-secondary/40 border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
          <p className="text-[14px] text-foreground whitespace-pre-wrap leading-relaxed">{entry.text}</p>
        </div>
      </div>
    )
  }

  if (entry.kind === 'file_action') {
    return (
      <div className="flex justify-center">
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] text-muted-foreground',
          'bg-secondary/60 border border-border',
        )}>
          <FileIcon className="size-3" />
          <span>{toolLabel(entry.tool)}</span>
          {entry.path && <code className="font-mono text-foreground/70">{entry.path}</code>}
        </div>
      </div>
    )
  }

  if (entry.kind === 'ask_user') {
    return (
      <div className="flex gap-3">
        <div className="size-7 rounded-full bg-accent/20 border border-accent/30 shrink-0 grid place-items-center mt-0.5">
          <HelpCircleIcon className="size-3.5 text-accent" />
        </div>
        <div className="max-w-[80%] space-y-2">
          <div className="bg-secondary/40 border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Question</p>
            <p className="text-[14px] text-foreground">{entry.question}</p>
            {entry.suggestions && entry.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {entry.suggestions.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-background border border-border text-[12px] text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (entry.kind === 'user_answer') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] bg-accent/15 border border-accent/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Answer</p>
          <p className="text-[14px] text-foreground">{entry.answer}</p>
        </div>
        <div className="size-7 rounded-full bg-secondary border border-border shrink-0 grid place-items-center mt-0.5">
          <MessageSquareIcon className="size-3.5 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return null
}

function toolLabel(tool: string): string {
  switch (tool) {
    case 'write_file': return 'Wrote'
    case 'str_replace': return 'Edited'
    case 'append_text': return 'Appended to'
    case 'read_file': return 'Read'
    case 'read_file_range': return 'Read range of'
    case 'list_files': return 'Listed files'
    case 'grep_file': return 'Searched'
    case 'search_files': return 'Searched files'
    case 'setup_database': return 'Set up database'
    default: return tool
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-indigo-bg)', color: 'var(--tint-indigo-fg)' }}>Approved</Badge>
  }
  if (status === 'pending') {
    return <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-amber-bg)', color: 'var(--tint-amber-fg)' }}>Pending</Badge>
  }
  return <Badge variant="secondary" className="text-[11px] font-semibold" style={{ background: 'var(--tint-coral-bg)', color: 'var(--tint-coral-fg)' }}>Rejected</Badge>
}
