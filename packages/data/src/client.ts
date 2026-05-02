const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res
}

export type AppStatus = 'draft' | 'published'

export type AppSummary = {
  id: string
  name: string
  description: string
  status: AppStatus
  createdAt: string
  updatedAt: string
}

export type App = AppSummary & {
  sourceCode: string | null
  compiledCode: string | null
  cssCode: string | null
}

export async function getApps(): Promise<AppSummary[]> {
  const res = await apiFetch('/apps')
  return res.json()
}

export async function getApp(appId: string): Promise<App> {
  const res = await apiFetch(`/apps/${appId}`)
  return res.json()
}

export async function createApp(name: string): Promise<App> {
  const res = await apiFetch('/apps', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function patchApp(
  appId: string,
  patch: Partial<Pick<App, 'name' | 'description' | 'status'>>
): Promise<App> {
  const res = await apiFetch(`/apps/${appId}`, {
    method: 'PATCH',
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
    body: JSON.stringify({ questionId, answer }),
  })
}

export async function generateText({ prompt, system, model }: { prompt: string; system?: string; model?: string }): Promise<string> {
  const res = await apiFetch('/ai/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt, system, model }),
  })
  if (!res.ok) throw new Error(`AI request failed: ${res.status}`)
  const data = await res.json() as { text: string }
  return data.text
}

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
