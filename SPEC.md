# AI Pipeline Board — Full Spec

## What We're Building

A Kanban board where each column has an AI pipeline attached. Dragging a card into a
column triggers that pipeline. Pipelines are defined in natural language — the user types
"generate a quiz from the card's study materials" and a builder agent figures out the
commands, parameters, UI, and data storage automatically.

Boards themselves are also created by an agent — the user describes what they want and a
board builder agent designs the columns and their pipelines. Predefined templates are saved
outputs of that same agent, not special-cased features.

---

## Phasing

This spec is built incrementally. The phased delivery plan lives at
`~/.claude/plans/let-s-plan-building-a-snazzy-babbage.md`. Headline milestone:
**after Phase 4** the user can describe a column's pipeline in natural language,
drag a card in, and watch it run end-to-end. Earlier phases scaffold the kanban
and shell execution; later phases layer agent execution, the App MCP, board-level
parameters, the board builder, and templates. Custom card renderers (Phase 9)
and teardown / hybrid pipelines (Phase 10) are explicitly deferred for v1.

---

## Stack

```
/frontend     Vite + React 18 + TanStack Query + TanStack Router + Tailwind + dnd-kit
/backend      Fastify + TypeScript + better-sqlite3
```

Workspace layout on disk:

```
data/
  app.db                  SQLite database
  .app-key                AES-GCM key (auto-generated on first boot)
  workspaces/
    <boardId>/            cwd for all shell + agent runs on that board
```

**Agent Runtime:**

All LLM calls go through a single `AgentRunner` interface in
`backend/src/agents/runner.ts`. The v1 implementation in
`backend/src/agents/claude.ts` wraps `@anthropic-ai/claude-agent-sdk` and is
configurable per call (tools: Bash, WebSearch, MCP; `cwd`; `env`). Centralizing
the seam means swapping providers later is one file. Builder agents call this
with WebSearch only (no Bash). Executor agents call it with Bash enabled and
`cwd = board.workspacePath`.

**Key concepts:**

- **Board parameters** — secrets and config shared across all pipelines on a board (e.g. a GitHub token used by multiple columns). Filled in once, available everywhere on that board.
- **Board setup** — a one-time shell pipeline that runs when the board workspace is first activated. Used for things like cloning a repo or configuring branch protection. Runs before any card can be processed.
- **Templates** — saved board definitions produced by the board builder agent. Instantiating a template creates a real board from the saved JSON.

---

## Parameter Scoping and Token Handling

Parameters exist at two scopes:

**Pipeline-scoped** — declared by the pipeline builder agent in the pipeline definition. Required before that pipeline can execute. Filled in via the ParameterForm when a card is first triggered.

**Board-scoped** — declared by the board builder agent at the board level. Shared across all pipelines on the board. Filled in once during board setup.

- Injected as environment variables into shell steps and agent runs

This means GitHub tokens, Heroku API keys, and any other credentials are just parameters. The agent uses the real CLI tools (the `gh` CLI, the `heroku` CLI) with the real tokens injected as env vars. No credential proxying, no CLI wrappers.

**Encryption at rest:** values for `type: "secret"` parameters are encrypted with AES-256-GCM before being persisted in SQLite. The key lives at `data/.app-key` and is auto-generated on first boot (mode `0600`). Non-secret parameters are stored as plain text. Both kinds are decrypted in-memory only at run time, immediately before being passed as env vars to the spawned shell or agent.

---

## Pipeline Definition JSON Schema

### Shell Pipeline

```json
{
  "type": "shell",
  "steps": [
    { "label": "Install Heroku CLI", "command": "npm install -g heroku" },
    { "label": "Deploy", "command": "git push heroku main" }
  ],
  "parameters": [
    {
      "key": "HEROKU_API_KEY",
      "label": "Heroku API Token",
      "description": "Found at heroku.com/account → API Key",
      "type": "secret",
      "required": true
    }
  ]
}
```

### Agent Pipeline

```json
{
  "type": "agent",
  "prompt": "Review the PR",
  "maxTurns": 20,
  "parameters": [
    {
      "key": "GITHUB_TOKEN",
      "label": "GitHub Personal Access Token",
      "description": "Needs repo scope. Create at github.com/settings/tokens",
      "type": "secret",
      "required": true
    }
  ]
}
```

## Executor Agent Tools

Because the agent runs server-side inside Fastify (no MCP boundary needed), tools are passed directly to the `AgentRunner` as native function definitions. No MCP server.

**`set_card_metadata(cardId: string, metadata: object)`** — v1
Shallow-merges `metadata` into the card's existing metadata in SQLite. The default card UI renders `card.metadata` as a collapsible JSON tree in the expanded view — no compilation required.

**`set_card_renderer(code: string)`** — Phase 9 (deferred)
Will let the builder agent register custom TSX rendered per-card via esbuild compilation. Out of scope until the core flow (Phases 1–8) is stable. While deferred, pipelines surface state via `set_card_metadata` only.

---

## Board Builder Agent

Sits above the pipeline builder. Takes a natural language description of a whole board and produces a complete board definition JSON including columns, pipelines, parameters, workspace config, and setup steps.

The board builder agent:
- Has web search to research tools, platforms, and APIs
- Calls the pipeline builder for each column that needs a pipeline
- Declares board-level parameters for credentials shared across columns
- Declares a setup pipeline for one-time workspace initialization
- Outputs a single board definition JSON

The board builder's system prompt describes all available v1 primitives: pipeline types (`shell`, `agent`), parameter types and scopes, the workspace concept, and the `set_card_metadata` MCP tool. Renderer registration (`set_card_renderer`) and the teardown mechanism are described in the prompt only once their phases land.

---

## Pipeline Builder Agent

Takes a natural language description of a single column's behavior and produces a pipeline definition JSON.

- Has web search to look up CLIs, API docs, and auth methods
- Chooses pipeline type: `shell` for deterministic commands, `agent` for reasoning tasks. Hybrid pipelines are out of scope for v1; the same effect is achievable by making a single agent pipeline that the agent shells out from.
- Declares all required parameters with helpful labels and descriptions
- Outputs pipeline definition JSON only — no explanation, no markdown
- v1 has no access to `set_card_renderer` (deferred to Phase 9). Pipelines surface state to the user via `set_card_metadata` only.

---

## Templates

Templates are saved board definition JSONs produced by the board builder agent. They live in the `templates` table and appear in the UI's template gallery.

**Adding a template:** Run the board builder agent with a prompt, review the output, save it to the templates table. No code changes required.

**Instantiating a template:** Creates a real board from the saved definition — boards, columns, pipelines, and parameters all created from the JSON. Board-level parameters show as unfilled; the user fills them in before the first card can run.

**The Website Builder template** is the board builder agent's output for:

> "A website builder like Lovable. Four columns: Todo with no pipeline, In Progress where an AI agent edits the codebase, Preview where the site is built and shown in an iframe on the card, and Publish where the site is deployed. Use a git-backed workspace. Configure branch protection on main so only the Publish pipeline can push there."

This template's board-level parameters include a GitHub token and a deploy platform token. The setup pipeline initializes the git repo and configures branch protection. No special-casing in the app.

---

## Execution Flow

```
Card dragged to column
       ↓
Does column have a pipeline?
  No  → just move the card
  Yes ↓
Are all required params filled? (pipeline + board level)
  No  → show ParameterForm → user fills in → save → proceed
  Yes ↓
Has board setup run?
  No  → run setup pipeline first → then proceed
  Yes ↓
Start execution → background job → return executionId
       ↓
Frontend opens GET /api/executions/:id/logs (SSE)
       ↓
Server streams log lines as they arrive (event: log)
       ↓
status: "success" | "failed" → server sends event: done → client closes stream
       ↓
If agent called set_card_metadata → card updates with new data
```

**Execution model:**

- `executions` row: `{ id, cardId, columnId, pipelineSnapshotJson, status, startedAt, finishedAt, exitCode? }`
  with `status ∈ pending → running → success | failed`. The pipeline definition is snapshotted onto the row at trigger time so re-saves of the column's pipeline don't retroactively change history.
- `execution_logs` rows: append-only `{ id, executionId, ts, stream, text }` where
  `stream ∈ "stdout" | "stderr" | "agent"`. The SSE endpoint streams rows as they are inserted; no cursor needed since the connection stays open for the duration of the execution.
- One execution at a time per card (concurrent triggers on the same card return `409 conflict`). Multiple cards on the same board can execute concurrently; their workspaces still share a directory, so pipelines that mutate the workspace should serialize themselves via the board's setup or via deterministic file paths.


## Key Design Decisions

- **Builder agents have WebSearch, no Bash** — they look up docs and emit pipeline / board JSON but cannot execute anything. Only the executor runs commands. (Once Phase 9 lands, builders also gain `set_card_renderer` via the App MCP.)
- **Executor agents have Bash + native tools** — `set_card_metadata` (and later `set_card_renderer`) are passed directly as tool definitions to `AgentRunner`. No MCP boundary. Secrets injected as env vars, `cwd` set to `board.workspacePath`.
- **Tokens are parameters** — GitHub tokens, Heroku tokens, any credential is just a `type: "secret"` parameter. Encrypted at rest, injected as env vars at runtime. The agent uses real CLIs with real tokens.
- **Branch protection is the safety layer** — for git-backed boards, main is protected at the repo level. The agent's token cannot push to main. Only the Publish shell pipeline can, and only because the user dragged the card there.
- **Revert is teardown** — what revert does is declared by the pipeline builder in the `teardown` field. The app just runs it. No special revert logic in the app. (Phase 10 — deferred for v1.)
- **Templates are saved agent output** — no special-casing. Adding a template means running the board builder agent and saving the JSON.
- **Board setup runs once** — the setup pipeline initializes the workspace before the first card can execute. After that, `boardSetup.completed = 1` and it never runs again.
- **One pipeline per column** — replacing a pipeline deletes the old one.
- **metadata is shallow-merged** — `setMetadata({ score: 9 })` merges, never replaces.
- **SSE for log streaming** — `GET /api/executions/:id/logs` is a Server-Sent Events endpoint. The server pushes `event: log` lines as they arrive and closes with `event: done` when the execution finishes. No polling.
- **Single user, no auth for v1** — local SQLite, localhost only.


## Example Board Builder Prompts

```
"A website builder like Lovable — Todo, In Progress with AI coding,
 Preview with iframe, Publish with deploy to GitHub Pages"

"A study workflow — collect reading material, generate quizzes from it,
 track quiz scores on each card"

"A content pipeline — Draft, Edit with AI review, SEO check, Publish to Ghost"

"A hiring pipeline — Applied, Phone Screen with AI summary, Interview, Offer"

"A code review board — Needs Review, In Review where an agent reviews PRs
 and posts comments, Approved, Merged"
```

## Example Pipeline Builder Prompts

```
Shell:
  "Deploy to Heroku using the Heroku CLI"
  "Publish this package to npm"
  "Run pytest and fail if any tests fail"

Agent:
  "Review the GitHub PR linked in the card and post a comment"
  "Generate a 10-question quiz from the card description"
  "Edit the codebase to implement the feature described in the card"
  "Review code for security issues — if approved, deploy to Heroku"
  "Run tests — if all pass, publish to npm"
```

(Hybrid as a distinct pipeline type and prompts that require custom card UI — interactive quiz takers, live preview iframes, syntax-highlighted diff viewers — are deferred to Phase 9/10. v1 covers them by the agent calling `set_card_metadata` and the default JSON-tree renderer displaying the result.)
