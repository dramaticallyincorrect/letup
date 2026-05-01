# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
pnpm dev:api      # Start API server with hot reload (tsx watch)
pnpm dev:web      # Start Vite dev server on port 3000
```

### Build & Type Check
```bash
pnpm build          # Build both api and web
pnpm typecheck      # Type-check both api and web
```

### Database
```bash
pnpm --filter api db:generate   # Generate Drizzle migrations after schema changes
pnpm --filter api db:migrate    # Apply pending migrations
pnpm --filter api db:studio     # Launch Drizzle Studio (DB browser)
```

### Testing & Linting
```bash
pnpm --filter api test     # Run API tests (Node built-in test runner)
pnpm --filter web lint     # ESLint the web package
```

## Environment Variables

```
# /api
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...

# /web
VITE_API_URL=http://localhost:3000
```

## Architecture

This is an AI-powered Kanban board — a pnpm monorepo with three packages:

- **`/api`** — Fastify 5 backend. PostgreSQL via Drizzle ORM. Exposes REST + SSE endpoints. Claude powers two AI agent loops.
- **`/web`** — React 19 frontend. TanStack Router + React Query. Tailwind CSS 4 + shadcn/ui. dnd-kit for drag-and-drop.
- **`/packages/data`** (`@repo/data`) — Shared library: typed API client functions and an SSE parser (`parseSSE()`).

### Data Model

```
boards
  └── board_columns (position-ordered, per-board)
        ├── pipelineKind: 'shell' | 'agent'
        ├── prompt: instructions for the AI agent
        ├── dataSchema: JSON Schema for card metadata
        ├── cardRenderer: compiled React component code (esbuild TSX→CJS)
        └── cards (belong to a column)
              └── data: JSONB metadata matching column's dataSchema
```

### AI Agent Loops

There are two distinct Claude agent loops, both streamed over SSE:

1. **Column Setup Agent** — triggered when creating a column with a prompt. Uses tools `set_data_schema` and `set_card_renderer` to configure the column. The renderer is TSX compiled to CommonJS via esbuild at runtime.

2. **Pipeline Agent** — triggered when a card is moved into a column (or via `POST /pipelines`). Uses tool `set_card_data` to update card JSONB metadata according to the column's schema and prompt.

Card renderer components receive a `patchMetadata` prop but **must only call it inside event handlers** (onClick, onChange, etc.), never at module load time.

### SSE Protocol

Streaming endpoints emit newline-delimited JSON events with a `type` field:
- `text` — Claude thinking/narration
- `tool_call` — tool invocation details
- `column` / `card` — updated entity after tool execution
- `error` — error details
- `done` — stream complete

The `parseSSE()` generator in `@repo/data/client.ts` handles parsing.

### API Routes (all under `/api/src/routes/boards.ts`)

```
GET/POST   /boards
GET/DELETE /boards/:boardId
POST       /boards/:boardId/columns    (SSE — runs column setup agent)
DELETE     /columns/:columnId
GET        /columns/:columnId/run      (SSE — re-runs column setup agent)
POST       /columns/:columnId          (add card)
PATCH      /cards/:cardId              (move card to different column)
PATCH      /cards/:cardId/metadata     (update card data, called by renderers)
POST       /pipelines                  (SSE — runs pipeline agent on a card)
```

Interactive API docs available at `http://localhost:3000/docs` (Scalar/Swagger).
