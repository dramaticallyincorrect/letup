import type { Board, Column, Card, Pipeline, Execution, MissingParam } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Boards
export const api = {
  boards: {
    list: () => request<Board[]>("/api/boards"),
    get: (id: string) => request<Board>(`/api/boards/${id}`),
    create: (name: string) =>
      request<Board>("/api/boards", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    update: (id: string, name: string) =>
      request<Board>(`/api/boards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<void>(`/api/boards/${id}`, { method: "DELETE" }),
  },

  columns: {
    list: (boardId: string) =>
      request<Column[]>(`/api/boards/${boardId}/columns`),
    create: (boardId: string, name: string) =>
      request<Column>(`/api/boards/${boardId}/columns`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    update: (id: string, name: string) =>
      request<Column>(`/api/columns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<void>(`/api/columns/${id}`, { method: "DELETE" }),
    reorder: (boardId: string, columns: { id: string; position: number }[]) =>
      request<void>(`/api/boards/${boardId}/columns/reorder`, {
        method: "POST",
        body: JSON.stringify({ columns }),
      }),
  },

  cards: {
    listByBoard: (boardId: string) =>
      request<Card[]>(`/api/boards/${boardId}/cards`),
    create: (columnId: string, title: string, description = "") =>
      request<Card>(`/api/columns/${columnId}/cards`, {
        method: "POST",
        body: JSON.stringify({ title, description }),
      }),
    update: (id: string, patch: { title?: string; description?: string }) =>
      request<Card>(`/api/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    move: (id: string, columnId: string, position: number) =>
      request<Card>(`/api/cards/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ columnId, position }),
      }),
    delete: (id: string) =>
      request<void>(`/api/cards/${id}`, { method: "DELETE" }),
  },

  pipelines: {
    listByBoard: (boardId: string) =>
      request<Record<string, Pipeline>>(`/api/boards/${boardId}/pipelines`),
    get: (columnId: string) =>
      request<Pipeline>(`/api/columns/${columnId}/pipeline`),
    save: (columnId: string, definition: unknown) =>
      request<Pipeline>(`/api/columns/${columnId}/pipeline`, {
        method: "PUT",
        body: JSON.stringify(definition),
      }),
    delete: (columnId: string) =>
      request<void>(`/api/columns/${columnId}/pipeline`, { method: "DELETE" }),
  },

  executions: {
    trigger: async (
      cardId: string,
      columnId: string
    ): Promise<{ executionId: string } | { missing: MissingParam[] }> => {
      const res = await fetch("/api/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, columnId }),
      });
      if (res.status === 409) return res.json();
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }
      return res.json();
    },
    get: (id: string) => request<Execution>(`/api/executions/${id}`),
    latestForCard: (cardId: string) =>
      request<Execution>(`/api/cards/${cardId}/executions/latest`),
  },

  parameters: {
    save: (
      scope: "pipeline" | "board",
      scopeId: string,
      values: Record<string, string>
    ) =>
      request<void>("/api/parameters", {
        method: "POST",
        body: JSON.stringify({ scope, scopeId, values }),
      }),
  },
};
