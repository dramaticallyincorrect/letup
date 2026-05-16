const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { ...init?.headers },
    credentials: 'include',
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type AppSummary = {
  id: string
  creatorId: string | null
  name: string
  description: string
  latestVersionNumber: number
  createdAt: string
  updatedAt: string
}

export type CreatedAppSummary = AppSummary & { isDraft: boolean | null }

export type App = AppSummary & {
  versionNumber: number | null
  isDraft: boolean | null
  sourceCode: string | null
  compiledCode: string | null
  cssCode: string | null
}

export type AppDetail = App & {
  conversationHistory: unknown[]
}


export type User = {
  id: string
  email: string
  handle: string
  displayName: string
  createdAt: string
  updatedAt: string
}

export type UserAppInstall = {
  userId: string
  versionId: string
  installedAt: string
  versionNumber: number
  appId: string
  appName: string
  appDescription: string
  latestVersionNumber: number
  appCreatedAt: string
  appUpdatedAt: string
}

// ── Apps ──────────────────────────────────────────────────────────────────────

export async function getApps(): Promise<AppSummary[]> {
  const res = await apiFetch('/apps')
  return res.json()
}

export async function getCreatedApps(): Promise<CreatedAppSummary[]> {
  const res = await apiFetch('/apps/created')
  return res.json()
}

export async function getApp(appId: string): Promise<App> {
  const res = await apiFetch(`/apps/${appId}`)
  return res.json()
}

export async function getAppForEdit(appId: string): Promise<AppDetail> {
  const res = await apiFetch(`/apps/${appId}/edit`)
  return res.json()
}

export async function createApp(name: string): Promise<App> {
  const res = await apiFetch('/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function installApp(appId: string): Promise<AppSummary> {
  const res = await apiFetch(`/apps/${appId}/install`, { method: 'POST' })
  return res.json()
}

export async function createDraft(appId: string): Promise<void> {
  await apiFetch(`/apps/${appId}/draft`, { method: 'POST' })
}

export async function patchApp(
  appId: string,
  patch: Partial<Pick<App, 'name' | 'description'>>
): Promise<App> {
  const res = await apiFetch(`/apps/${appId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return res.json()
}

export async function uninstallApp(appId: string): Promise<void> {
  await apiFetch(`/apps/${appId}`, { method: 'DELETE' })
}

export async function deleteApp(appId: string): Promise<void> {
  await apiFetch(`/apps/${appId}/draft`, { method: 'DELETE' })
}

export function buildApp(
  appId: string,
  userMessage: string,
  opts?: { signal?: AbortSignal; model?: string },
): Promise<Response> {
  return fetch(`${baseUrl}/apps/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ appId, userMessage, ...(opts?.model ? { model: opts.model } : {}) }),
    signal: opts?.signal,
  })
}

export async function answerAppQuestion(questionId: string, answer: string): Promise<void> {
  await apiFetch('/apps/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, answer }),
  })
}

export type AppBuildUsage = {
  buildSessionId: string
  userMessage: string | null
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  microUnitsUsed: string
  createdAt: string
  durationSeconds: number
}

export type AppVersionUsage = {
  appVersionId: string
  versionNumber: number
  isDraft: boolean
  builds: AppBuildUsage[]
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  totalMicroUnitsUsed: string
}

export function microUnitsToUsd(microUnits: string | number | bigint): string {
  return `$${(Number(microUnits) / 12_500_000).toFixed(4)}`
}

export async function getAppUsage(appId: string): Promise<AppVersionUsage[]> {
  const res = await apiFetch(`/apps/${appId}/usage`)
  return res.json()
}

// ── Billing ───────────────────────────────────────────────────────────────────

export type BillingStatus = {
  plan: 'free' | 'pro'
  status: string
  currentPeriodEnd: string | null
  credits: number
  microUnitsBalance: string
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await apiFetch('/billing/status')
  return res.json()
}

export async function getBillingPortalUrl(): Promise<{ url: string }> {
  const res = await apiFetch('/billing/portal')
  return res.json()
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User> {
  const res = await apiFetch(`/me`)
  return res.json()
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function queryAppDb(
  appId: string,
  sql: string,
  params?: unknown[],
  draft?: boolean,
): Promise<{ rows: unknown[] }> {
  const url = draft ? `/apps/${appId}/db/query?draft=true` : `/apps/${appId}/db/query`
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  return res.json()
}

// ── AI ────────────────────────────────────────────────────────────────────────

export async function generateText({ prompt, system, model }: { prompt: string; system?: string; model?: string }): Promise<string> {
  const res = await apiFetch('/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prompt, system, model }),
  })
  if (!res.ok) throw new Error(`AI request failed: ${res.status}`)
  const data = await res.json() as { text: string }
  return data.text
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export const MARKETPLACE_CATEGORIES = [
  'Books',
  'Business',
  'Developer Tools',
  'Education',
  'Entertainment',
  'Finance',
  'Food & Drink',
  'Graphics & Design',
  'Health & Fitness',
  'Lifestyle',
  'Music',
  'News',
  'Photo & Video',
  'Productivity',
  'Reference',
  'Shopping',
  'Social Networking',
  'Sports',
  'Travel',
  'Utilities',
  'Weather',
  'Writing',
] as const

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export type MarketplaceSubmission = {
  id: string
  appId: string
  submittedBy: string
  category: string
  description: string
  status: SubmissionStatus
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type MarketplaceListing = {
  id: string
  appId: string
  category: string
  description: string
  appName: string
  appCreatorHandle: string
  totalInstalls: number
  avgRating: number | null
}

export async function submitApp(
  appId: string,
  body: { category: string; description: string },
): Promise<MarketplaceSubmission> {
  const res = await apiFetch(`/apps/${appId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function getAppSubmission(appId: string): Promise<MarketplaceSubmission | null> {
  try {
    const res = await apiFetch(`/apps/${appId}/submission`)
    return res.json()
  } catch {
    return null
  }
}

export async function approveSubmission(submissionId: string): Promise<MarketplaceListing> {
  const res = await apiFetch(`/marketplace/submissions/${submissionId}/approve`, { method: 'POST' })
  return res.json()
}

export async function getMarketplaceListings(): Promise<MarketplaceListing[]> {
  const res = await apiFetch('/marketplace/listings')
  return res.json()
}

export async function installMarketplaceListing(appId: string): Promise<void> {
  await apiFetch(`/marketplace/listings/${appId}/install`, { method: 'POST' })
}

// ── SSE ───────────────────────────────────────────────────────────────────────

export async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      let eventName = 'message'
      let dataStr = ''
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7)
        else if (line.startsWith('data: ')) dataStr = line.slice(6)
      }
      if (dataStr) {
        try { yield { event: eventName, data: JSON.parse(dataStr) } } catch { /* skip malformed */ }
      }
    }
  }
}
