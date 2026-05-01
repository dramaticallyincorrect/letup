const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res
}

export type WidgetStatus = 'draft' | 'published'

export type WidgetSummary = {
  id: string
  name: string
  description: string
  status: WidgetStatus
  createdAt: string
  updatedAt: string
}

export type Widget = WidgetSummary & {
  sourceCode: string | null
  compiledCode: string | null
  cssCode: string | null
}

export async function getWidgets(): Promise<WidgetSummary[]> {
  const res = await apiFetch('/widgets')
  return res.json()
}

export async function getWidget(widgetId: string): Promise<Widget> {
  const res = await apiFetch(`/widgets/${widgetId}`)
  return res.json()
}

export async function createWidget(name: string): Promise<Widget> {
  const res = await apiFetch('/widgets', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function patchWidget(
  widgetId: string,
  patch: Partial<Pick<Widget, 'name' | 'description' | 'status'>>
): Promise<Widget> {
  const res = await apiFetch(`/widgets/${widgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.json()
}

export async function deleteWidget(widgetId: string): Promise<void> {
  await apiFetch(`/widgets/${widgetId}`, { method: 'DELETE' })
}

export function buildWidget(widgetId: string, userMessage: string): Promise<Response> {
  return fetch(`${baseUrl}/widgets/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widgetId, userMessage }),
  })
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
