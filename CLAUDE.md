# CLAUDE.md — KDL Import Consignment Tracker

This file is the **operating manual** for any Claude session working on this project. Read it before touching anything else.

---

## 1. Project at a Glance

- **What:** Web app replacing Kingdao Logistics' shared Excel tracker (`TRACKER_--_KDL.xlsx`).
- **Who:** Internal staff of a Tanzanian customs clearing & forwarding company. ~400+ consignments/year.
- **Scope of truth:** `PRD.md` is the canonical product spec. Anything not in the PRD is a **decision** — log it in `decisions.md` before acting on it.
- **Why this exists vs. Excel:** Real-time multi-user visibility, audit trail, stuck-job detection, role-based access, generated reports.

---

## 2. Stack (locked)

| Layer | Choice |
|---|---|
| Framework | **Next.js 15 (App Router)** with TypeScript, React Server Components where sensible |
| UI | **Tailwind CSS** + **shadcn/ui** + Radix primitives |
| State / data | **TanStack Query** for client cache, **TanStack Table** for data grids, **Zustand** only if needed for ephemeral UI state |
| Forms | **react-hook-form** + **zod** for validation (shared schemas between client & server) |
| DB / Auth / Realtime / Storage | **Supabase** (Postgres + Auth + Realtime + Storage) |
| Migrations | **Supabase CLI** — every schema change is a versioned SQL file in `supabase/migrations/`. Never edit schema in the Supabase Studio UI for prod. |
| Excel I/O | **SheetJS (xlsx)** for import; **exceljs** for styled exports |
| PDF export | **@react-pdf/renderer** (server-rendered) |
| Date/time | **date-fns** + **date-fns-tz** (Africa/Dar_es_Salaam, UTC+3) |
| Testing | **Vitest** (unit), **Playwright** (e2e for critical paths only) |
| Deployment | **Vercel** (frontend) + **Supabase Cloud** (DB/Auth) |
| Email (alerts) | **Resend** via a Supabase edge function |

**Locked decisions, do not revisit unless `decisions.md` says otherwise.**

---

## 3. Architectural Principles

1. **Database is the source of truth for business rules.** Every pipeline-stage prerequisite from PRD §8 is enforced by a Postgres trigger or check constraint *in addition to* app-layer zod validation. UI guards alone are insufficient.
2. **Row Level Security (RLS) is non-negotiable.** Every table has RLS on. Service-role key is only used in trusted server actions / edge functions, never shipped to the client.
3. **Per-column permissions** are enforced two ways: (a) RLS policies that gate UPDATE on specific columns via a `permissions` table, and (b) the UI hides/disables fields the user can't write. Both must agree.
4. **Audit log is append-only.** `audit_log` table is written by Postgres triggers on every UPDATE/INSERT/DELETE of `consignments`, `efd_records`, `clients`, `icds`, `users`, `role_permissions`. Triggers, not app code — app code can be bypassed.
5. **Soft delete only.** `deleted_at` column. Nothing is ever hard-deleted from the operational tables.
6. **Time zone:** All timestamps stored as `timestamptz` in UTC. Display in Africa/Dar_es_Salaam. The "48 hour stuck" rule operates in real elapsed time, not local-business-hour time.
7. **Realtime:** Subscribe to changes on `consignments` and `efd_records` via Supabase Realtime. Use TanStack Query's `setQueryData` to merge incoming events — do not refetch on every event.
8. **No premature abstractions.** Three similar lines beats one over-engineered helper. Don't build a generic "permission framework" — build exactly what's in `decisions.md`.

---

## 4. Repository Layout

```
kingdaoLogistics/
├── PRD.md                          # canonical product spec — DO NOT EDIT
├── CLAUDE.md                       # this file — operating manual
├── tasks.md                        # ordered task list, Claude updates as work progresses
├── status.md                       # live project state — updated after EVERY task
├── decisions.md                    # every off-PRD decision logged here
├── validation.md                   # self-check rules Claude runs before declaring "done"
├── humanTasks.md                   # things only Baraka can do (sign up for services, click buttons)
├── KINGDAO_LOGO.png                # brand asset
├── README.md                       # public-facing project README (generated late)
│
├── apps/web/                       # Next.js app
│   ├── src/app/                    # App Router pages
│   ├── src/components/             # shared React components
│   ├── src/lib/                    # client utilities (supabase client, query keys, formatters)
│   ├── src/server/                 # server actions, server-only utilities
│   ├── src/schemas/                # shared zod schemas
│   └── src/types/                  # generated Supabase types + handwritten types
│
├── supabase/
│   ├── config.toml                 # Supabase CLI project config
│   ├── migrations/                 # versioned SQL migrations (the only way schema changes ship)
│   ├── seed.sql                    # reference data (clients, ICDs from PRD §13)
│   └── functions/                  # edge functions (alerts, scheduled jobs)
│
├── scripts/
│   ├── import-tracker.ts           # one-shot historical XLSX importer (CLI form of the UI importer)
│   └── generate-types.sh           # regenerate Supabase TS types after migrations
│
└── tests/
    ├── unit/                       # vitest specs
    └── e2e/                        # playwright critical paths
```

---

## 5. The Workflow Loop (How Claude Operates)

Every coding session follows this loop. Deviations require a note in `status.md`.

1. **Read `status.md`** — know where the project is.
2. **Read `tasks.md`** — pick the next pending task (lowest ID, not blocked).
3. **Read `decisions.md`** — make sure the task isn't superseded by a later decision.
4. **Run the work.** If a non-PRD design choice comes up, **stop and log it in `decisions.md` before implementing.**
5. **Run `validation.md` checks** for the affected area.
6. **Update `tasks.md`** (mark done) and **`status.md`** (what changed, what's next).
7. **Commit** with a clear conventional-commit message.

If you cannot complete a task end-to-end (e.g. blocked on a human task), do NOT mark it done — write the blocker into `humanTasks.md` and into the task itself.

---

## 6. Supabase Migrations — The Rule

**No schema change ever happens via the Studio UI.** All changes are versioned SQL files in `supabase/migrations/` committed to git. Per **D-019**, we run two cloud projects (`kdl-tracker-dev`, `kdl-tracker-prod`) and use the CLI's linked-project workflow — no Docker, no local stack.

Standard workflow (Windows, PowerShell):

```powershell
# One-time per machine: log the CLI into Supabase
supabase login

# Link the CLI to the project you want to work against (switch any time)
supabase link --project-ref <dev-project-ref>

# Make a new migration file (timestamped automatically)
supabase migration new add_consignments_table

# Edit the generated file in supabase/migrations/ — write the SQL

# Apply pending migrations to the currently-linked project
supabase db push

# Regenerate TS types from the linked DB
supabase gen types typescript --linked > apps/web/src/types/supabase.ts

# When the change is verified on dev, switch link to prod and push again
supabase link --project-ref <prod-project-ref>
supabase db push
```

**Standard flow for any schema change:**
1. Write the migration file.
2. `supabase db push` against **dev**.
3. Manually verify in dev (run the app, check the data).
4. Re-link to **prod** and `supabase db push` again.
5. Commit the migration file.

**If a migration would be destructive (drop column, rename table, drop constraint):** write a guarded migration that preserves data, and log the rationale in `decisions.md`.

**RLS policies are migrations too.** Don't hand-edit policies in the dashboard.

---

## 7. Naming & Code Conventions

- **DB:** `snake_case`, plural table names (`consignments`, `efd_records`).
- **TypeScript:** `camelCase` for variables, `PascalCase` for types/components.
- **Server actions** live in `src/server/actions/<feature>.ts` and are named verbs (`createConsignment`, `advanceStage`).
- **Zod schemas** in `src/schemas/<entity>.ts` — one schema per shape, suffixed `Schema`. Reuse for both server validation and form resolvers.
- **Query keys** centralized in `src/lib/query-keys.ts` — never inline literal arrays.
- **Imports:** absolute paths via `@/` only.

---

## 8. Per-Column Permissions — Implementation Note

This is the most novel part of the system. The shape:

- `roles` table: `id`, `name`, `is_system` (admin/operator/viewer are system roles).
- `role_column_permissions` table: `role_id`, `table_name`, `column_name`, `can_read`, `can_write`.
- `user_roles` table: `user_id`, `role_id`.
- A SQL function `current_user_can_write(table_name, column_name)` is called by RLS policies on UPDATE.
- The client fetches the current user's effective column permissions on login and uses them to disable/hide fields. The server independently enforces them — never trust the client.

Default seeds:
- **admin** — read+write everything (including `role_column_permissions`).
- **operator** — read everything, write all operational columns; cannot write `amount` or change `client_id` after creation.
- **viewer** — read most columns, write nothing.

Admins can clone a role and tweak per-column toggles via the Settings UI.

---

## 9. Pipeline State Machine

The pipeline (PRD §7.1, §8.21) is encoded as:

- A `pipeline_stage` enum or status columns on `consignments`.
- A Postgres function `advance_stage(consignment_id, stage, new_value)` is the **only** way to mutate stage fields. It:
  1. Checks prerequisites from PRD §8.6–§8.12.
  2. Writes the new value.
  3. Writes a row to `stage_history` (for the 48-hour stuck check).
  4. Auto-propagates: TBS Debit Paid → Duty Paid; release_status=Released → release_date=today (if null).
  5. Propagates EFD code to in_ref siblings.

The API/server action layer never touches stage columns directly — always through this function. This is how we make "data integrity enforced at API level" (PRD §11) actually true.

---

## 10. What "Done" Means for a Task

A task is only **done** when:

1. The code compiles (`pnpm typecheck`).
2. `pnpm lint` is clean.
3. Vitest unit tests for the touched area pass.
4. The relevant `validation.md` checklist items pass.
5. `status.md` reflects the new state.
6. The task line in `tasks.md` is marked `[x]`.

Partial implementations stay in `in_progress`. Do not mark `done` to look productive.

---

## 11. Things Claude Should Never Do

- Edit `PRD.md`. It's frozen at v1.
- Edit schema via Supabase Studio for a deployed environment.
- Commit `.env*` files or service-role keys.
- Use `--no-verify` on git commits.
- Force-push to `main`.
- Use the service-role Supabase key in any client-bundled code.
- Hard-delete consignments, EFDs, or clients.
- Mock the database in tests that exercise business rules — those run against a real local Supabase.

---

## 12. Coordination With Baraka (the user)

- Human-only tasks (signups, payment, DNS) live in `humanTasks.md`.
- Decisions Claude makes outside the PRD are logged in `decisions.md` with rationale.
- If a task requires a credential or external account, pause and put a clear ask in `humanTasks.md` with exact steps.
