import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as client from '@repo/data'
import { useSession, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Chrome } from './components/chrome'
import {
  UserIcon,
  CreditCardIcon,
  SparklesIcon,
  LogOutIcon,
} from 'lucide-react'

const PLAN_CREDITS = { free: 15, pro: 100 } as const

export function AccountPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session, isPending } = useSession()
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/login' })
    }
  }, [isPending, session, navigate])

  const { data: billing, isPending: billingPending } = useQuery({
    queryKey: ['billing-status'],
    queryFn: client.getBillingStatus,
    enabled: !!session?.user,
    retry: false,
  })

  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const user = session.user as { email: string; name: string }
  const plan = billing?.plan ?? 'free'
  const status = billing?.status ?? 'active'
  const credits = billing?.credits ?? 0
  const periodEnd = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    : null
  const allotment = PLAN_CREDITS[plan]
  const usedPct = Math.max(0, Math.min(100, (credits / allotment) * 100))

  async function handleManageSubscription() {
    setPortalError(null)
    setPortalLoading(true)
    try {
      const { url } = await client.getBillingPortalUrl()
      window.location.href = url
    } catch {
      setPortalError('Could not open subscription portal.')
      setPortalLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
    navigate({ to: '/login' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Chrome active="library" />

      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 max-[900px]:px-4 max-[900px]:pt-8 max-[900px]:pb-20">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[34px] font-bold tracking-tight mb-1.5 text-foreground leading-none">
              Account
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Manage your profile and subscription.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="size-4" /> Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Row label="Display name" value={user.name || '—'} />
              <Separator />
              <Row label="Email" value={user.email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCardIcon className="size-4" /> Subscription
              </CardTitle>
              <CardDescription>
                {billingPending ? 'Loading…' : `You are on the ${plan} plan.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant={plan === 'pro' ? 'default' : 'secondary'}>
                  {plan === 'pro' ? 'Pro' : 'Free'}
                </Badge>
              </div>
              <Separator />
              <Row label="Status" value={capitalize(status)} />
              {periodEnd && (
                <>
                  <Separator />
                  <Row
                    label={status === 'canceled' ? 'Ends on' : 'Renews on'}
                    value={periodEnd}
                  />
                </>
              )}
              <div className="flex flex-col gap-2 pt-2">
                {plan === 'free' ? (
                  <Button asChild>
                    <Link to="/payment" search={{ billing: 'annual' }}>
                      <SparklesIcon className="size-4" /> Upgrade to Pro
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    {portalLoading ? 'Opening…' : 'Manage subscription'}
                  </Button>
                )}
                {portalError && (
                  <p className="text-xs text-destructive">{portalError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4" /> Credits
              </CardTitle>
              <CardDescription>
                Used to build apps.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight">
                  {credits}
                </span>
                <span className="text-sm text-muted-foreground">
                  of {allotment} {plan === 'pro' ? 'monthly' : 'one-time'} credits remaining
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            variant="destructive"
            onClick={handleSignOut}
            className="w-full"
          >
            <LogOutIcon className="size-4" /> Sign out
          </Button>
        </div>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
