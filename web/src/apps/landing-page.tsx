import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const SHOWCASE_APPS = [
  { g: '📝', name: 'Meeting Notes', desc: 'Summarize and extract action items', tint: 'indigo' },
  { g: '💸', name: 'Expense Tracker', desc: 'Log and categorize spending', tint: 'sage' },
  { g: '📊', name: 'Weekly Review', desc: 'Reflect on your week with structure', tint: 'coral' },
  { g: '🎯', name: 'Goal Tracker', desc: 'Break goals into daily habits', tint: 'amber' },
  { g: '📦', name: 'Inventory', desc: 'Track stock across locations', tint: 'plum' },
  { g: '🗓️', name: 'Shift Planner', desc: 'Build and share team schedules', tint: 'sky' },
  { g: '📚', name: 'Reading List', desc: 'Track books with AI summaries', tint: 'mint' },
  { g: '🍳', name: 'Recipe Box', desc: 'Generate recipes from ingredients', tint: 'amber' },
]

const AVATAR_COLORS = ['#D97757', '#5B8DEF', '#3EBF8A', '#E8A838', '#A87ECF']

const FREE_FEATURES = [
  '10 Claude credits / month',
  'Build & run 1 app',
  'Browse the marketplace',
  'Install published apps',
  'Share your app via link',
]

const PRO_FEATURES = [
  '50 Claude credits / month',
  'Unlimited apps',
  'Publish to the marketplace',
  'Priority support',
  'Early access to new features',
  'Custom app domains',
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

function TintIcon({ tint, glyph, className }: { tint: string; glyph: string; className?: string }) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-lg shrink-0 transition-transform hover:-translate-y-0.5',
        className,
      )}
      style={{
        background: `var(--tint-${tint}-bg)`,
        color: `var(--tint-${tint}-fg)`,
        boxShadow: '0 2px 10px oklch(0.165 0.018 68 / 0.07)',
      }}
    >
      {glyph}
    </div>
  )
}

function LandingNav() {
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
      <div className="max-w-6xl mx-auto h-15 px-10 flex items-center gap-1">
        {/* Brand */}
        <div
          className="flex items-center gap-2 font-bold text-base tracking-tight mr-5"
          style={{ color: CORAL.heroInk }}
        >
          <span
            className="size-6.5 rounded-lg grid place-items-center text-sm font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            m
          </span>
          mini
        </div>

        {/* Nav links */}
        {[
          { label: 'Features', href: '#features' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'Marketplace', href: '/marketplace' },
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

        <div className="flex-1" />

        {/* Auth CTAs */}
        <Link
          to="/login"
          className="font-semibold text-sm no-underline px-3.5 py-2 rounded-lg mr-1 transition-opacity"
          style={{ color: CORAL.heroInk, opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="inline-flex items-center h-9 px-5 rounded-full font-bold text-sm no-underline transition-[filter]"
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
      </div>
    </header>
  )
}

function HeroSection() {
  return (
    <section
      className="flex items-center relative overflow-hidden"
      style={{ background: CORAL.heroBg, minHeight: 'calc(100vh - var(--spacing) * 15)' }}
      id="features"
    >
      <div className="max-w-4xl mx-auto px-10 py-18 flex flex-col items-center text-center gap-7 w-full relative">
        <h1
          className="m-0 font-extrabold tracking-tighter leading-none text-balance"
          style={{
            fontSize: 'clamp(2.75rem, 6vw, 4.5rem)',
            color: CORAL.heroInk,
          }}
        >
          Built by you, for you.
        </h1>

        {/* Sub */}
        <p
          className="m-0 text-lg leading-relaxed max-w-lg font-normal text-pretty"
          style={{ color: CORAL.heroSub }}
        >
          Create apps that fit your unique workflows, or customize and extend apps built by the community
        </p>

        {/* CTAs */}
        <div className="flex gap-3 justify-center flex-wrap">
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
          <Link
            to="/marketplace"
            className="inline-flex items-center h-13 px-6.5 rounded-full font-semibold text-sm no-underline transition-[filter]"
            style={{ background: CORAL.ctaSecBg, color: CORAL.ctaSecColor }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.95)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Browse marketplace
          </Link>
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-3 justify-center">
          <div className="flex">
            {AVATAR_COLORS.map((c, i) => (
              <div
                key={i}
                className="size-6.5 rounded-full shrink-0"
                style={{
                  background: c,
                  marginLeft: i > 0 ? '-7px' : 0,
                  border: `2.5px solid ${CORAL.heroBg}`,
                }}
              />
            ))}
          </div>
          <p className="m-0 text-sm font-medium" style={{ color: CORAL.heroSub }}>
            <strong style={{ color: CORAL.heroInk, fontWeight: 700 }}>2,400+</strong>{' '}
            apps built this month
          </p>
        </div>

        {/* App icon grid */}
        <div className="flex gap-2.5 justify-center flex-wrap max-w-lg mt-1">
          {SHOWCASE_APPS.map((app, i) => (
            <TintIcon key={i} tint={app.tint} glyph={app.g} className="size-13 text-2xl" />
          ))}
        </div>
      </div>
    </section>
  )
}

function ShowcaseSection() {
  const doubled = [...SHOWCASE_APPS, ...SHOWCASE_APPS]
  return (
    <section className="py-22 bg-background border-t border-b border-border">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-10 pb-12 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground m-0 mb-2.5">
          App showcase
        </p>
        <h2
          className="m-0 font-extrabold tracking-tight text-foreground leading-tight"
          style={{ fontSize: 'clamp(1.625rem, 3vw, 2.5rem)' }}
        >
          What will you build?
        </h2>
        <p className="mt-3 mb-0 mx-auto max-w-lg text-base text-muted-foreground leading-relaxed text-pretty font-normal">
          Build the app that matches you or customize existing apps to fit your needs.
        </p>
      </div>

      {/* Marquee */}
      <div
        className="overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <div className="animate-marquee flex gap-3.5 w-max p-4">
          {doubled.map((app, i) => (
            <Card
              key={i}
              className="w-54 shrink-0 rounded-2xl shadow-(--shadow-sm) bg-card p-0"
            >
              <CardContent className="p-4.5 pb-5 flex flex-col gap-2.5">
                <TintIcon tint={app.tint} glyph={app.g} className="size-10 text-xl" />
                <div>
                  <div className="font-bold text-sm text-foreground tracking-tight">
                    {app.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-normal">
                    {app.desc}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
  ctaLabel,
}: {
  label: string
  amount: string
  period: string
  tagline: string
  features: string[]
  featured?: boolean
  ctaLabel: string
}) {
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

        <div className="mt-3.5 flex items-baseline gap-1.5">
          <span
            className="text-5xl font-extrabold tracking-tighter leading-none"
            style={{ color: featured ? 'var(--background)' : 'var(--foreground)' }}
          >
            {amount}
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: featured ? 'rgba(250,247,242,0.48)' : 'var(--muted-foreground)' }}
          >
            {period}
          </span>
        </div>

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
          {features.map(f => (
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
          asChild
          className={`mt-7 h-12 rounded-full font-bold text-sm w-full ${featured
            ? 'bg-background text-foreground hover:bg-background/90 shadow-[0_2px_8px_oklch(0.165_0.018_68/0.08)]'
            : 'bg-secondary text-foreground border border-input hover:bg-secondary/80'
            }`}
          variant="ghost"
        >
          <Link to="/signup">{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-10 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-15">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground m-0 mb-2.5">
            Pricing
          </p>
          <h2
            className="m-0 font-extrabold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(1.625rem, 3vw, 2.5rem)' }}
          >
            Simple pricing
          </h2>
          <p className="mt-3 mb-0 mx-auto max-w-sm text-base text-muted-foreground leading-relaxed">
            Start free. Upgrade when you're ready.
          </p>
        </div>

        <div className="flex gap-5 justify-center items-start max-w-4xl mx-auto pt-3.5 max-[880px]:flex-col max-[880px]:items-center">
          <PricingCard
            label="Free"
            amount="$0"
            period="/ forever"
            tagline="Get started with no credit card required."
            features={FREE_FEATURES}
            ctaLabel="Sign up free"
          />
          <PricingCard
            label="Pro"
            amount="$12"
            period="/ month"
            tagline="get the most out of letup with pro features"
            features={PRO_FEATURES}
            featured
            ctaLabel="Get Pro"
          />
        </div>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="bg-secondary border-t border-border px-10 py-8">
      <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-5">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <span
            className="size-5.5 rounded-sm grid place-items-center text-xs font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            m
          </span>
          mini
        </div>
        <div className="flex gap-6">
          {['Terms', 'Privacy'].map(l => (
            <a
              key={l}
              href="#"
              className="text-sm font-medium text-muted-foreground no-underline hover:text-foreground transition-colors"
            >
              {l}
            </a>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} Dramatically Incorrect</div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <LandingNav />
      <HeroSection />
      <ShowcaseSection />
      <PricingSection />
      <LandingFooter />
    </div>
  )
}
