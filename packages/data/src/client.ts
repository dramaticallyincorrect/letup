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

export async function addCardToBoard(columnId: string, card: Card): Promise<Card> {
  const res = await apiFetch(`/columns/${columnId}`, {
    method: 'POST',
    body: JSON.stringify(card),
  })
  return res.json()
}
