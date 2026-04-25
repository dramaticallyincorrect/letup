# My New Idea — Platform Reference

## Overview

My New Idea is a hybrid Linear + Lovable: a Kanban-style project management tool where tasks are automatically executed by an AI agent and shipped through a gated preview/publish flow. Users manage work like a task tracker, but instead of a human doing the work, an AI agent builds it — and the platform handles branching, preview deployments, and production publishing automatically.

---

## Core User Flow

1. User creates a **Project** → the platform provisions a React codebase in a GitHub repository
2. User adds a **Task** (Title + Description) to the **Todo** column
3. User clicks the **Start** icon on a task → task moves to **In Progress**
4. An **AI agent** picks up the task, reads the description, works on a git branch, and commits code changes
5. AI completes its work → task moves to **Review**
6. A **preview environment** is automatically deployed (Heroku) so the user can inspect the result
7. User can:
   - **Reject** → move back to In Progress with a comment describing what needs to change
   - **Approve** → move to **Publish**
8. Publish triggers a deploy to the **main/production** environment

---

## Column Definitions (MVP)

| Column | Entered by | Triggers |
|--------|------------|----------|
| Todo | User (manual task creation) | Nothing |
| In Progress | User (clicks Start) | AI agent begins work |
| Review | AI agent (on completion) | Preview deployment |
| Publish | User (approval) | Production deployment |

---

## Data Model

### Project
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| name | string | |
| github_repo_url | string | Provisioned on project creation |
| created_at | timestamp | |

### Task
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| project_id | uuid | FK → Project |
| title | string | |
| description | text | Used as the AI prompt |
| status | enum | todo, in_progress, review, publish |
| created_at | timestamp | |

### Comment
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| task_id | uuid | FK → Task |
| body | text | |
| author | enum | user, ai |
| created_at | timestamp | |

---

## AI Integration

- The AI agent receives the task `title` + `description` as its prompt
- It needs access to the repository file system to read, write, and commit code
- **Research area**: how to give an AI agent a sandboxed file system with git access
  - Options: E2B sandboxes, Modal volumes, GitHub Codespaces API, self-hosted runner with `git clone`
- The agent works on a dedicated branch per task (e.g. `task/{task-id}`)
- On completion the agent commits, pushes, and updates the task status to `review` via the platform API

---

## Deployment Architecture

### Preview (Review column)
- Heroku review apps or ephemeral dynos spun up per branch
- Each preview gets an automatic subdomain: `task-{id}.preview.mynewidea.app`
- Preview URL is attached to the task and shown in the Review card

### Production (Publish column)
- Deploy to the Heroku main dyno (or future: user-defined target)
- Triggered when user moves the task to Publish
- Merges the task branch into `main` and deploys

---

## Extensible Column System (Future Vision)

The MVP has four hardcoded columns. The long-term goal is to make columns fully programmable so users can define their own workflow stages with custom AI jobs and custom deployment targets.

### Concept: Columns as Config Objects

Each column would be a record in the database rather than hardcoded logic:

- **Name** — display label
- **Position** — order in the board
- **AI job config** — optional: what AI job to run when a task enters this column, with parameters
- **Deploy hook config** — optional: where to deploy, what webhook to call, with what payload

The four MVP columns become the default implementation of this system — they're just columns with specific built-in handlers.

### Event / Trigger System

Column transitions fire typed events:

```
task.moved_to.<column_slug>
```

Each column registers handlers for this event. Handlers are dispatched by a job runner. Today the handlers are hardcoded (start AI, deploy to Heroku). In the future, handlers are resolved from the column's config at runtime.

### Custom AI Jobs

A user could create a **Security Review** column where any task that enters triggers a static analysis AI job. Or a **QA** column that generates and runs automated tests. The column config specifies:
- Which AI job to run
- What parameters to pass (repo context, task description, etc.)
- What "done" looks like (exit condition for moving to the next column)

### Custom Deployment Hooks

Instead of Heroku, a column's deploy step could point to:
- A user-supplied webhook URL (the platform POSTs task context, the user's infra handles it)
- A named provider integration (Vercel, Fly.io, AWS, etc.)
- No deployment at all (for non-deploy columns like QA or Security Review)

The platform calls the hook, waits for a status callback, and reflects progress in the UI.

### Engineering Requirements for Extensible Columns

- **DB schema**: `columns` table with `id`, `project_id`, `name`, `position`, `ai_job_config JSONB`, `deploy_hook_config JSONB`
- **Job runner abstraction**: dispatches the right handler based on column config rather than a hardcoded switch
- **Webhook delivery**: outbound calls to user hooks with retry logic, timeout handling, and status callbacks
- **Column editor UI**: drag-to-reorder, add/remove columns, configure AI job and deploy hook per column
- **Validation layer**: schema validation on column configs before saving

### Security Considerations

- User-supplied webhook URLs are untrusted: validate domains, use scoped tokens, rate-limit calls
- User-defined AI job configs must be sandboxed — no cross-tenant file system access
- Webhook payloads should contain only necessary task context, not full repo credentials

---

## Open Engineering Questions

- **AI file system access**: Which sandboxing approach balances security, speed, and cost? (E2B, Modal, Codespaces API, self-hosted)
- **Subdomain provisioning**: Wildcard DNS + dynamic Heroku app creation, or a reverse proxy with path-based routing?
- **Auth & billing**: Clerk vs. Supabase Auth for sign-up; Stripe for payments
- **Multi-tenancy isolation**: How to ensure one user's AI agent cannot access another project's repo or secrets
- **Branch lifecycle**: When to delete preview branches and ephemeral environments (on Publish? on task deletion?)

---

## Infrastructure & Auth (Planned, Post-MVP)

- User sign-up / authentication (Clerk or Supabase Auth)
- Payment and plan limits (Stripe)
- Multi-tenant project isolation
- GitHub App or OAuth integration for repo provisioning
- Observability: logs and deployment status surfaced in the task UI
