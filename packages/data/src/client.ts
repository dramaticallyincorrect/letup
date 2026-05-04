const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type AppStatus = 'draft' | 'published'

export type AppSummary = {
  id: string
  creatorId: string | null
  name: string
  description: string
  status: AppStatus
  latestVersionNumber: number
  createdAt: string
  updatedAt: string
}

export type App = AppSummary & {
  sourceCode: string | null
  compiledCode: string | null
  cssCode: string | null
}

export type AppDetail = App & {
  conversationHistory: unknown[]
}


export type User = {
  id: string
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
  appStatus: AppStatus
  latestVersionNumber: number
  appCreatedAt: string
  appUpdatedAt: string
}

// ── Apps ──────────────────────────────────────────────────────────────────────

export async function getApps(): Promise<AppSummary[]> {
  const res = await apiFetch('/apps')
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

export async function deleteApp(appId: string): Promise<void> {
  await apiFetch(`/apps/${appId}`, { method: 'DELETE' })
}

export function buildApp(appId: string, userMessage: string): Promise<Response> {
  return fetch(`${baseUrl}/apps/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, userMessage }),
  })
}

export async function answerAppQuestion(questionId: string, answer: string): Promise<void> {
  await apiFetch('/apps/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, answer }),
  })
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User> {
  const res = await apiFetch(`/users/${userId}`)
  return res.json()
}

export async function getUserInstalls(userId: string): Promise<UserAppInstall[]> {
  const res = await apiFetch(`/users/${userId}/installs`)
  return res.json()
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function queryAppDb(
  appId: string,
  sql: string,
  params?: unknown[]
): Promise<{ rows: unknown[] }> {
  const res = await apiFetch(`/apps/${appId}/db/query`, {
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
    body: JSON.stringify({ prompt, system, model }),
  })
  if (!res.ok) throw new Error(`AI request failed: ${res.status}`)
  const data = await res.json() as { text: string }
  return data.text
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
