import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { signIn, signUp } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await signUp.email({ name, email, password })
      setLoading(false)
      console.log('Sign up result:', { error })
      if (error) {
        setError(error.message ?? 'Sign up failed')
        return
      }
      navigate({ to: '/' })
    } catch (err) {
      console.error('Sign up error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
      return
    }
  }

  async function handleGoogle() {
    await signIn.social({ provider: 'google', callbackURL: '/' })
  }

  async function handleGitHub() {
    await signIn.social({ provider: 'github', callbackURL: '/' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col items-center justify-center px-4">

      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 font-bold text-[17px] tracking-[-0.015em] text-foreground no-underline mb-10">
        <span
          className="size-7 rounded-lg grid place-items-center text-sm font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          m
        </span>
        <span>mini</span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-95 bg-card border border-border rounded-2xl p-8 shadow-(--shadow-md)">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground mb-1">
          Create your account
        </h1>
        <p className="text-[13.5px] text-muted-foreground mb-7">
          Build and share apps with AI.
        </p>

        {/* OAuth */}
        <div className="flex flex-col gap-2.5 mb-6">
          <Button variant="outline" className="w-full h-10 font-medium" onClick={handleGoogle}>
            <GoogleIcon />
            Continue with Google
          </Button>
          <Button variant="outline" className="w-full h-10 font-medium" onClick={handleGitHub}>
            <GitHubIcon />
            Continue with GitHub
          </Button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <span className="flex-1 border-t border-border" />
          <span className="text-[12px] text-muted-foreground">or</span>
          <span className="flex-1 border-t border-border" />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-[13px] font-medium">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[13px] font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-[13px] font-medium">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-[13px] text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full h-10 mt-1 font-semibold" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>

      {/* Sign in link */}
      <p className="mt-6 text-[13.5px] text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-foreground font-medium underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.6 2.41v2h2.58c1.51-1.39 2.4-3.44 2.4-5.87Z" fill="#4285F4" />
      <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.59-2.01c-.71.48-1.63.76-2.71.76-2.08 0-3.84-1.4-4.47-3.29H.86v2.07A8 8 0 0 0 8 16Z" fill="#34A853" />
      <path d="M3.53 9.52A4.81 4.81 0 0 1 3.28 8c0-.53.09-1.04.25-1.52V4.41H.86A8 8 0 0 0 0 8c0 1.29.31 2.51.86 3.59l2.67-2.07Z" fill="#FBBC05" />
      <path d="M8 3.18c1.17 0 2.22.4 3.05 1.2l2.28-2.28A8 8 0 0 0 8 0 8 8 0 0 0 .86 4.41L3.53 6.48C4.16 4.58 5.92 3.18 8 3.18Z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
