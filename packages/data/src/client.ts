const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res
}

export type Board = {
  id: string
  name: string
  createdAt: string
}

export type Card = {
  title: string,
  description: string
}

export type BoardCard = {
  id: string
  title: string
  description: string
  data: unknown
  position: number
}

export type BoardColumn = {
  id: string
  name: string
  pipelineKind: 'shell' | 'agent'
  position: number
  cardRenderer: string | null
  cards: BoardCard[]
}

export type BoardDetail = Board & {
  columns: BoardColumn[]
}

export async function getBoards(): Promise<Board[]> {
  const res = await apiFetch('/boards')
  return res.json()
}

export async function getBoard(boardId: string): Promise<BoardDetail> {
  const res = await apiFetch(`/boards/${boardId}`)
  return res.json()
}

export async function createBoard(name: string): Promise<Board> {
  const res = await apiFetch('/boards', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function addColumn(boardId: string, params: {
  name: string
  prompt?: string
}): Promise<BoardColumn> {
  const res = await apiFetch(`/boards/${boardId}/columns`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return res.json()
}

export async function addCardToBoard(columnId: string, card: Card): Promise<Card> {
  const res = await apiFetch(`/columns/${columnId}`, {
    method: 'POST',
    body: JSON.stringify(card),
  })
  return res.json()
}

export async function deleteColumn(columnId: string): Promise<void> {
  await fetch(`${baseUrl}/columns/${columnId}`, { method: 'DELETE' })
}

export async function patchCardMetadata(cardId: string, patch: Record<string, unknown>): Promise<void> {
  await apiFetch(`/cards/${cardId}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify({ patch }),
  })
}

export async function moveCardToColumn(cardId: string, destinationColumnId: string): Promise<void> {
  const res = await apiFetch(`/cards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      destinationColumnId
    }),
  })
  return res.json()
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