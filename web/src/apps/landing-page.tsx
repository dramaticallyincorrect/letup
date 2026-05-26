import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth-client'
import { usePaddlePrices } from '@/lib/use-paddle-prices'


const FREE_FEATURES = [
  '15 credits one-time',
  'smaller, slower-tier models',
  '2 installed apps',
  'Included app data storage',
  'Share your app in letup app store'
]

const PRO_FEATURES_MONTHLY = [
  '100 credits / month',
  'Advanced Models: Opus 4.7',
  'Customize app store apps: coming soon',
  'Unlimited apps',
  'Share your app in letup app store'
]

const PRO_FEATURES_ANNUAL = [
  '1,200 credits upfront',
  'Advanced Models: Opus 4.7',
  'Customize app store apps: coming soon',
  'Unlimited apps',
  'Share your app in letup app store'
]

// coral variant tokens as CSS values
const CORAL = {
  heroBg: 'oklch(0.86 0.09 32)',
  heroInk: 'oklch(0.2 0.07 30)',
  heroSub: 'oklch(0.38 0.08 30)',
  navBg: 'oklch(0.86 0.09 32 / 0.9)',
  navBorder: 'oklch(0.2 0.07 30 / 0.1)',
  eyeBg: 'oklch(0.2 0.07 30 / 0.12)',
  eyeColor: 'oklch(0.2 0.07 30)',
  ctaBg: 'oklch(0.2 0.07 30)',
  ctaColor: 'oklch(0.95 0.03 35)',
  ctaSecBg: 'rgba(255,255,255,0.32)',
  ctaSecColor: 'oklch(0.2 0.07 30)',
}


function LandingNav() {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: CORAL.navBg,
        borderColor: CORAL.navBorder,
        backdropFilter: 'blur(20px) saturate(130%)',
        WebkitBackdropFilter: 'blur(20px) saturate(130%)',
      }}
    >
      <div className="max-w-6xl mx-auto h-14 px-4 sm:px-10 flex items-center gap-1 min-w-0">
        {/* Brand */}
        <div
          className="flex items-center gap-2 font-bold text-base tracking-tight mr-2 sm:mr-5 shrink-0"
          style={{ color: CORAL.heroInk }}
        >
          <span
            className="size-6.5 rounded-lg grid place-items-center text-sm font-bold text-white shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            L
          </span>
          Letup
        </div>

        {/* Nav links — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1">
          {[
            { label: 'Features', href: '#features' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'App Store', href: '/marketplace' },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="font-semibold text-sm px-3 py-1.5 rounded-lg transition-colors no-underline"
              style={{ color: CORAL.heroInk, opacity: 0.62 }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'rgba(128,128,128,0.09)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '0.62'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex-1" />

        {/* Auth CTAs */}
        {isLoggedIn ? (
          <Link
            to="/home"
            className="inline-flex items-center h-9 px-4 sm:px-5 rounded-full font-bold text-sm no-underline transition-[filter] shrink-0"
            style={{
              background: CORAL.ctaBg,
              color: CORAL.ctaColor,
              boxShadow: '0 1px 4px oklch(0.165 0.018 68 / 0.12)',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.06)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Go to app
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="font-semibold text-sm no-underline px-3 py-2 rounded-lg mr-1 transition-opacity shrink-0"
              style={{ color: CORAL.heroInk, opacity: 0.7 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center h-9 px-4 sm:px-5 rounded-full font-bold text-sm no-underline transition-[filter] shrink-0"
              style={{
                background: CORAL.ctaBg,
                color: CORAL.ctaColor,
                boxShadow: '0 1px 4px oklch(0.165 0.018 68 / 0.12)',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.06)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
            >
              Sign up free
            </Link>
          </>
        )}
      </div>
    </header>
  )
}

const SHOWCASE_SLIDES = [
  {
    label: 'Expense Tracker',
    prompt: 'a particle simulator',
    img: './showcase_1.webm',
  },
  {
    label: 'Meeting Notes',
    prompt: 'a meeting notes app with action item extraction',
    img: './showcase_1.webm',
  },
  {
    label: 'Goal Tracker',
    prompt: 'a daily goal tracker with streaks',
    img: './showcase_1.webm',
  },
]

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function ScrambleText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState(text)
  const frameRef = useRef<number | null>(null)
  const iterRef = useRef(0)

  useEffect(() => {
    iterRef.current = 0
    const totalFrames = text.length * 2.5

    const animate = () => {
      iterRef.current++
      const iter = iterRef.current
      setDisplayed(
        text.split('').map((char, i) => {
          if (char === ' ') return ' '
          if (iter > i * 2) return char
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        }).join('')
      )
      if (iter < totalFrames) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [text])

  return <span>{displayed}</span>
}

const SLIDE_DURATION = 4000

function AppShowcase({
  active,
  visible,
}: {
  active: number
  visible: boolean
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex-1 relative"
      style={{
        boxShadow: '0 24px 64px oklch(0.2 0.07 30 / 0.22), 0 1px 0 oklch(1 0 0 / 0.5) inset',
        border: '1px solid oklch(0.2 0.07 30 / 0.1)',
        minHeight: '480px',
      }}
    >
      {SHOWCASE_SLIDES.map((slide, i) => (
        <video
          key={i}
          src={slide.img}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: i === active && visible ? 1 : 0 }}
          autoPlay
          loop
          muted
        />
      ))}
    </div>
  )
}

function HeroSection() {
  const [active, setActive] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goTo = (index: number) => {
    setVisible(false)
    setTimeout(() => {
      setActive(index)
      setVisible(true)
    }, 300)
  }

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      goTo((active + 1) % SHOWCASE_SLIDES.length)
    }, SLIDE_DURATION)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [active])

  return (
    <section
      className="flex items-center relative overflow-hidden"
      style={{ background: CORAL.heroBg, minHeight: '100vh' }}
      id="features"
    >
      <div className="flex flex-col lg:flex-row w-full gap-10 lg:gap-14 py-18 ml-12">
        {/* Left: aligned with nav content, constrained width */}
        <div
          className="flex flex-col gap-7 shrink-0"
          style={{
            paddingLeft: 'max(1rem, calc((100vw - 90rem) / 2))',
            width: 'clamp(280px, 36vw, 680px)',
          }}
        >
          <h1
            className="m-0 font-extrabold tracking-tighter leading-none text-balance"
            style={{
              fontSize: 'clamp(2.75rem, 6vw, 4.5rem)',
              color: CORAL.heroInk,
            }}
          >
            Built by you, for you.
          </h1>

          <p
            className="m-0 text-lg leading-relaxed font-normal text-pretty"
            style={{ color: CORAL.heroSub }}
          >
            Create web apps that fit your unique workflows, or customize and extend apps built by the community
          </p>

          {/* Prompt label */}
          <div
            className="transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            <div
              className="inline-flex rounded-fullpy-2"
            >
              <span style={{ color: CORAL.heroSub, opacity: 0.3 }}>·</span>
              <span className="text-sm font-medium italic" style={{ color: CORAL.heroInk }}>
                "<ScrambleText text={SHOWCASE_SLIDES[active].prompt} />"
              </span>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 h-13 px-7.5 rounded-full font-bold text-base no-underline transition-[filter]"
              style={{ background: CORAL.ctaBg, color: CORAL.ctaColor }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.06)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
            >
              Sign up free{' '}
              <span style={{ opacity: 0.5, fontWeight: 400 }}>→</span>
            </Link>
          </div>
        </div>

        {/* Right: showcase — bleed to right edge */}
        <div className="flex-1  aspect-video flex flex-col pr-12">
          <AppShowcase active={active} visible={visible}/>
        </div>
      </div>
    </section>
  )
}

function PricingCard({
  label,
  amount,
  period,
  tagline,
  features,
  featured,
  annualFeatures,
  ctaLabel,
  onCtaClick,
  annualAmount,
  annualBilledNote,
  discountBadge,
}: {
  label: string
  amount: string
  period: string
  tagline: string
  features: string[]
  annualFeatures?: string[]
  featured?: boolean
  ctaLabel: string
  onCtaClick?: (billingCycle: 'monthly' | 'annual') => void
  annualAmount?: string
  annualBilledNote?: string
  discountBadge?: string
}) {
  const [isAnnual, setIsAnnual] = useState(true)
  const hasAnnual = !!annualAmount
  const displayAmount = hasAnnual && isAnnual ? annualAmount : amount
  const displayFeatures = hasAnnual && isAnnual && annualFeatures ? annualFeatures : features

  return (
    <Card
      className={`flex-1 flex flex-col relative rounded-2xl border overflow-visible ${featured
        ? 'bg-foreground text-background border-foreground shadow-(--shadow-lg) -translate-y-2.5'
        : 'bg-card border-border'
        }`}
    >
      <CardContent className="p-9 flex flex-col flex-1">
        <p
          className="text-xs font-bold uppercase tracking-widest m-0"
          style={{ color: featured ? 'rgba(250,247,242,0.48)' : undefined }}
        >
          {label}
        </p>

        {hasAnnual && (
          <div className="mt-3.5 flex items-center">
            <div
              className="inline-flex rounded-full p-0.5 text-xs font-semibold"
              style={{
                background: featured ? 'rgba(255,255,255,0.12)' : 'var(--secondary)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsAnnual(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 transition-all',
                  isAnnual
                    ? featured
                      ? 'bg-background text-foreground'
                      : 'bg-foreground text-background'
                    : 'text-inherit opacity-50',
                )}
              >
                Annual
                {discountBadge && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                    style={{
                      background: isAnnual
                        ? 'oklch(0.76 0.14 145 / 0.22)'
                        : featured
                          ? 'rgba(255,255,255,0.12)'
                          : 'var(--tint-sage-bg)',
                      color: isAnnual
                        ? 'oklch(0.78 0.16 145)'
                        : featured
                          ? 'rgba(250,247,242,0.6)'
                          : 'var(--tint-sage-fg)',
                    }}
                  >
                    {discountBadge}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsAnnual(false)}
                className={cn(
                  'rounded-full px-3 py-1 transition-all',
                  !isAnnual
                    ? featured
                      ? 'bg-background text-foreground'
                      : 'bg-foreground text-background'
                    : 'opacity-50',
                )}
              >
                Monthly
              </button>
            </div>
          </div>
        )}

        <div className={cn('flex items-baseline gap-1.5', hasAnnual ? 'mt-3' : 'mt-3.5')}>
          <span
            className="text-5xl font-extrabold tracking-tighter leading-none"
            style={{ color: featured ? 'var(--background)' : 'var(--foreground)' }}
          >
            {displayAmount}
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: featured ? 'rgba(250,247,242,0.48)' : 'var(--muted-foreground)' }}
          >
            {period}
          </span>
        </div>
        {(hasAnnual && isAnnual && annualBilledNote) && (
          <p
            className="text-xs mt-1 mb-0"
            style={{ color: featured ? 'rgba(250,247,242,0.4)' : 'var(--muted-foreground)' }}
          >
            {annualBilledNote}
          </p>
        )}

        <p
          className="text-sm mt-2.5 mb-0 leading-relaxed"
          style={{ color: featured ? 'rgba(250,247,242,0.68)' : 'var(--muted-foreground)' }}
        >
          {tagline}
        </p>

        <hr
          className="my-6 border-0 border-t"
          style={{ borderColor: featured ? 'rgba(255,255,255,0.12)' : 'var(--border)' }}
        />

        <div className="flex flex-col gap-0.5">
          {displayFeatures.map(f => (
            <div key={f} className="flex items-center gap-3 py-1">
              <div
                className="size-4.5 rounded-full grid place-items-center shrink-0"
                style={
                  featured
                    ? {
                      background: 'oklch(0.76 0.14 145 / 0.22)',
                      color: 'oklch(0.78 0.16 145)',
                    }
                    : {
                      background: 'var(--tint-sage-bg)',
                      color: 'var(--tint-sage-fg)',
                    }
                }
              >
                <CheckIcon size={10} strokeWidth={3} />
              </div>
              <span
                className="text-sm font-medium"
                style={{ color: featured ? 'rgba(250,247,242,0.88)' : 'var(--muted-foreground)' }}
              >
                {f}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-5" />

        <Button
          className={`mt-7 h-12 rounded-full font-bold text-sm w-full ${featured
            ? 'bg-background text-foreground hover:bg-background/90 shadow-[0_2px_8px_oklch(0.165_0.018_68/0.08)]'
            : 'bg-secondary text-foreground border border-input hover:bg-secondary/80'
            }`}
          variant="ghost"
          onClick={onCtaClick ? () => onCtaClick(isAnnual ? 'annual' : 'monthly') : undefined}
          asChild={!onCtaClick}
        >
          {onCtaClick ? ctaLabel : <Link to="/signup">{ctaLabel}</Link>}
        </Button>
      </CardContent>
    </Card>
  )
}

function PricingSection() {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const navigate = useNavigate()

  const prices = usePaddlePrices()

  const monthlyDisplay = prices.monthly?.formatted ?? '$15'
  const annualMonthlyDisplay = prices.annual?.monthlyFormatted ?? '$12.50'
  const annualBilledNote = `billed ${prices.annual?.formatted ?? '$150'} annually`

  const monthlyTotal = prices.monthly ? parseFloat(prices.monthly.total) : 15
  const annualTotal = prices.annual ? parseFloat(prices.annual.total) : 150
  const discountPct = Math.round((1 - annualTotal / (monthlyTotal * 12)) * 100)
  const discountBadge = `${discountPct}% off`

  const freeDisplay = new Intl.NumberFormat(navigator.language, {
    style: 'currency',
    currency: prices.currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0)

  const goToCheckout = (billingCycle: 'monthly' | 'annual') => {
    if (isLoggedIn) {
      navigate({ to: '/payment', search: { billing: billingCycle } })
    } else {
      navigate({ to: '/signup', search: { next: `/payment?billing=${billingCycle}` } as never })
    }
  }

  return (
    <section id="pricing" className="py-24 px-4 sm:px-10 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-15">
          <h2
            className="m-0 font-extrabold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(1.625rem, 3vw, 2.5rem)' }}
          >
            Start Building taylor made apps.
          </h2>
        </div>

        <div className="flex gap-5 justify-center items-start max-w-4xl mx-auto pt-3.5 flex-col sm:flex-row sm:items-start items-stretch">
          <div className="order-2 sm:order-1 flex flex-col flex-1 w-full">
            <PricingCard
              label="Free"
              amount={freeDisplay}
              period=""
              tagline="Get started with no credit card required."
              features={FREE_FEATURES}
              ctaLabel="Sign up"
            />
          </div>
          <div className="order-1 sm:order-2 flex flex-col flex-1 w-full">
            <PricingCard
              label="Pro"
              amount={monthlyDisplay}
              period="/ month"
              annualAmount={annualMonthlyDisplay}
              annualBilledNote={annualBilledNote}
              discountBadge={discountBadge}
              tagline="get the most out of letup with pro features"
              features={PRO_FEATURES_MONTHLY}
              annualFeatures={PRO_FEATURES_ANNUAL}
              featured
              ctaLabel="Get Pro"
              onCtaClick={goToCheckout}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="bg-secondary border-t border-border px-4 sm:px-10 py-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <span
            className="size-5.5 rounded-sm grid place-items-center text-xs font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            L
          </span>
          Letup
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {([['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Refund Policy', '/refund']] as const).map(([label, to]) => (
            <Link
              key={label}
              to={to}
              className="text-sm font-medium text-muted-foreground no-underline hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} Dramatically Incorrect</div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  const { data: session } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (session?.user) {
      navigate({ to: '/home' })
    }
  }, [session])

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <LandingNav />
      <HeroSection />
      <PricingSection />
      <LandingFooter />
    </div>
  )
}
