import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { useSession } from '@/lib/auth-client'
import { CheckIcon, ArrowLeftIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePaddlePrices } from '@/lib/use-paddle-prices'

const PRO_FEATURES_TAIL = [
  'Unlimited apps',
  'Publish to the marketplace',
  'Priority support'
]

export function PaymentPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const { billing } = useSearch({ from: '/protected/payment' })
  const paddleRef = useRef<Paddle | null>(null)
  const openedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [isAnnual, setIsAnnual] = useState(billing !== 'monthly')

  const prices = usePaddlePrices()

  const monthlyTotal = prices.monthly ? parseFloat(prices.monthly.total) : 15
  const annualTotal = prices.annual ? parseFloat(prices.annual.total) : 150
  const discountPct = Math.round((1 - annualTotal / (monthlyTotal * 12)) * 100)

  const displayAmount = isAnnual
    ? (prices.annual?.monthlyFormatted ?? '$12.50')
    : (prices.monthly?.formatted ?? '$15')
  const annualBilledNote = `billed ${prices.annual?.formatted ?? '$150'} annually`

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      navigate({ to: '/signup', search: { next: '/payment' } as never })
    }
  }, [isPending, session, navigate])

  useEffect(() => {
    if (!session?.user || openedRef.current) return

    const priceId = isAnnual
      ? import.meta.env.VITE_PADDLE_ANNUAL_PRICE_ID
      : import.meta.env.VITE_PADDLE_MONTHLY_PRICE_ID
    const token = import.meta.env.VITE_PADDLE_CLIENT
    const environment = (import.meta.env.VITE_PADDLE_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production'

    if (!priceId || !token) {
      setError('Paddle is not configured.')
      return
    }

    openedRef.current = true

    initializePaddle({
      environment,
      token,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          navigate({ to: '/home' })
        }
      },
    }).then((p) => {
      paddleRef.current = p ?? null
      if (!p) {
        setError('Failed to load Paddle.')
        return
      }
      p.Checkout.open({
        settings: {
          displayMode: 'inline',
          frameTarget: 'paddle-checkout-frame',
          frameInitialHeight: 450,
          frameStyle: 'width:100%; min-height:450px; background:transparent; border:none;',
        },
        items: [{ priceId, quantity: 1 }],
        customData: { userId: session.user.id } as Record<string, unknown>,
        customer: session.user.email ? { email: session.user.email } : undefined,
      })
    }).catch((e) => {
      console.error('Paddle init error:', e)
      setError('Failed to load checkout.')
    })
  }, [session, navigate])

  const handleBillingToggle = (annual: boolean) => {
    if (annual === isAnnual) return
    setIsAnnual(annual)

    const priceId = annual
      ? import.meta.env.VITE_PADDLE_ANNUAL_PRICE_ID
      : import.meta.env.VITE_PADDLE_MONTHLY_PRICE_ID

    if (!priceId) {
      setError('Paddle is not configured.')
      return
    }

    paddleRef.current?.Checkout.open({
      settings: {
        displayMode: 'inline',
        frameTarget: 'paddle-checkout-frame',
        frameInitialHeight: 450,
        frameStyle: 'width:100%; min-height:450px; background:transparent; border:none;',
      },
      items: [{ priceId, quantity: 1 }],
      customData: { userId: session?.user?.id } as Record<string, unknown>,
      customer: session?.user?.email ? { email: session.user.email } : undefined,
    })
  }

  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto h-15 px-10 flex items-center gap-4">
          <Link
            to="/home"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground no-underline"
          >
            <ArrowLeftIcon size={14} />
            Back
          </Link>
          <div className="flex items-center gap-2 font-bold text-base tracking-tight ml-auto">
            <span
              className="size-6.5 rounded-lg grid place-items-center text-sm font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              L
            </span>
            Letup
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Plan summary */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
              Upgrade
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight mb-4">Pro plan</h1>

            {/* Billing toggle */}
            <div className="inline-flex rounded-full p-0.5 mb-4 text-sm font-semibold bg-secondary">
              <button
                type="button"
                onClick={() => handleBillingToggle(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-all',
                  isAnnual ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                Annual
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                  style={{
                    background: isAnnual ? 'oklch(0.76 0.14 145 / 0.22)' : 'var(--tint-sage-bg)',
                    color: isAnnual ? 'oklch(0.78 0.16 145)' : 'var(--tint-sage-fg)',
                  }}
                >
                  {discountPct}% off
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleBillingToggle(false)}
                className={cn(
                  'rounded-full px-4 py-1.5 transition-all',
                  !isAnnual ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                Monthly
              </button>
            </div>

            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-4xl font-extrabold">{displayAmount}</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            {isAnnual && (
              <p className="text-xs text-muted-foreground mb-5">{annualBilledNote}</p>
            )}
            <p className={`text-sm text-muted-foreground leading-relaxed ${isAnnual ? '' : 'mt-5'} mb-6`}>
              Get the most out of letup with pro features. Cancel anytime.
            </p>
            <div className="flex flex-col gap-2">
              {[isAnnual ? '1,200 credits upfront' : '100 credits / month', ...PRO_FEATURES_TAIL].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <div
                    className="size-4.5 rounded-full grid place-items-center shrink-0"
                    style={{ background: 'var(--tint-sage-bg)', color: 'var(--tint-sage-fg)' }}
                  >
                    <CheckIcon size={10} strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-(--shadow-md)">
            <h2 className="text-lg font-bold tracking-tight mb-4">Payment details</h2>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <div className="paddle-checkout-frame" />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
