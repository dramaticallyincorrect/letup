import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { useSession } from '@/lib/auth-client'
import { CheckIcon, ArrowLeftIcon } from 'lucide-react'

const PRO_FEATURES = [
  '100 Claude credits / month',
  'Unlimited apps',
  'Publish to the marketplace',
  'Priority support',
  'Early access to new features',
  'Custom app domains',
]

export function PaymentPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const paddleRef = useRef<Paddle | null>(null)
  const openedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      navigate({ to: '/signup', search: { next: '/payment' } as never })
    }
  }, [isPending, session, navigate])

  useEffect(() => {
    if (!session?.user || openedRef.current) return

    const priceId = import.meta.env.VITE_PADDLE_PRICE_ID
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
              m
            </span>
            mini
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
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">Pro plan</h1>
            <div className="flex items-baseline gap-1.5 mb-6">
              <span className="text-4xl font-extrabold">$12</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Get the most out of letup with pro features. Cancel anytime.
            </p>
            <div className="flex flex-col gap-2">
              {PRO_FEATURES.map((f) => (
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
