# CLAUDE.md — KDL Import Consignment Tracker

This file is the **operating manual** for any Claude session working on this project. Read it before touching anything else.

---

## 1. Project at a Glance

- **What:** Web app replacing Kingdao Logistics' shared Excel tracker (`TRACKER_--_KDL.xlsx`).
- **Who:** Internal staff of a Tanzanian customs clearing & forwarding company. ~400+ consignments/year.
- **Scope of truth:** `PRD.md` is the canonical product spec — **frozen at v1, do not edit**. Anything not in the PRD is a **decision** — log it in `decisions.md` before acting on it.
- **Why this exists vs. Excel:** Real-time multi-user visibility, audit trail, stuck-job detection, role-based access, generated reports.

---

## 2. Stack (locked)

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript + React 19, RSC where sensible |
| UI | **Tailwind 4** + **shadcn/ui** on **Base UI** primitives (D-023) |
| Data | **TanStack Query** (cache) + **TanStack Table** (grids); Zustand only if needed |
| Forms | **react-hook-form** + **zod** (schemas shared client/server) |
| Backend | **Supabase** Cloud (Postgres + Auth + Realtime + Storage). Two projects: dev + prod (D-019) |
| Migrations | **Supabase CLI**, versioned SQL in `supabase/migrations/`. Never via Studio UI |
| API keys | New `sb_publishable_…` / `sb_secret_…` keys (D-020). Never the legacy anon/service_role |
| Excel I/O | **SheetJS** (read) + **exceljs** (write) |
| PDF | **@react-pdf/renderer** (server-rendered) |
| Time | **date-fns** + **date-fns-tz** (Africa/Dar_es_Salaam, UTC+3, no DST) |
| Testing | **Vitest** (unit), **Playwright** (3 critical e2e paths only — D-018) |
| Hosting | **Vercel** + **Supabase Cloud** |
| Email | **Resend** via Supabase Edge Function |
| Package manager | **pnpm** pinned via `packageManager` field + Corepack (D-016, D-026) |

Locked. Don't revisit unless `decisions.md` updates it.

---

## 3. Architectural Principles

1. **Database is the source of truth for business rules.** Every pipeline-stage prerequisite is enforced by a Postgres trigger or check constraint *in addition to* app-layer zod validation. UI guards alone are insufficient.
2. **Row Level Security is non-negotiable.** Every table has RLS on. The Supabase secret key is only used in trusted server actions / edge functions, never shipped to the client.
3. **Per-column permissions** are enforced two ways: RLS policies on UPDATE *and* UI hiding/disabling fields. Both must agree. See `docs/permissions.md`.
4. **Audit log is append-only**, written by Postgres triggers on every UPDATE/INSERT/DELETE of tracked tables. Triggers, not app code — app code can be bypassed.
5. **Soft delete only.** `deleted_at` column. Nothing is ever hard-deleted from operational tables.
6. **Time zone:** All timestamps stored as `timestamptz` in UTC. Display in Africa/Dar_es_Salaam. The "48-hour stuck" rule operates in real elapsed time, not local business hours.
7. **Realtime:** Subscribe to changes on `consignments` and `efd_records` via Supabase Realtime. Merge incoming events into TanStack Query with `setQueryData` — do not refetch on every event.
8. **No premature abstractions.** Three similar lines beats one over-engineered helper. Don't build a generic "permission framework" — build exactly what's in `decisions.md`.

---

## 4. The Workflow Loop

Every coding session follows this loop. Deviations require a note in `status.md`.

1. **Read `status.md`** — know where the project is.
2. **Read `tasks.md`** — pick the next pending task (lowest ID, not blocked).
3. **Scan `decisions.md`** — make sure the task isn't superseded by a later decision.
4. **Run the work.** If a non-PRD design choice comes up, **stop and log it in `decisions.md` before implementing.**
5. **Run `validation.md` checks** for the affected area.
6. **Update `tasks.md`** (mark done) and **`status.md`** (what changed, what's next).
7. **Commit** with a clear conventional-commit message.

If you cannot complete a task end-to-end (e.g. blocked on a human task), do **not** mark it done — write the blocker into `humanTasks.md` and into the task itself.

---

## 5. Naming & Code Conventions

- **DB:** `snake_case`, plural table names (`consignments`, `efd_records`).
- **TypeScript:** `camelCase` for variables, `PascalCase` for types/components.
- **Server actions** in `src/server/actions/<feature>.ts`, named as verbs (`createConsignment`, `advanceStage`).
- **Zod schemas** in `src/schemas/<entity>.ts`, one schema per shape, suffixed `Schema`. Reuse for server validation and form resolvers.
- **Query keys** centralized in `src/lib/query-keys.ts` — never inline literal arrays.
- **Imports:** absolute paths via `@/` only.

---

## 6. What "Done" Means

A task is **done** only when:

1. `pnpm typecheck` is clean.
2. `pnpm lint` is clean.
3. Vitest unit tests for the touched area pass.
4. Relevant `validation.md` checklist items pass.
5. `status.md` reflects the new state.
6. The task line in `tasks.md` is marked `[x]`.

Partial work stays `in_progress`. Do not mark `done` to look productive.

---

## 7. Never Do

- Edit `PRD.md` (frozen at v1).
- Edit schema via Supabase Studio for any deployed environment.
- Commit `.env*` files or Supabase secret keys.
- Use `--no-verify` on git commits.
- Force-push to `main`.
- Use the Supabase secret key in any client-bundled code.
- Hard-delete consignments, EFDs, or clients.
- Mock the database in tests that exercise business rules — those run against the **dev** Supabase project (D-019; we have no local Supabase).

---

## 8. Deep-Dive References

Don't inline these — read them when the work requires it.

- **Migrations workflow** → `supabase/MIGRATIONS.md`
- **Per-column permissions implementation** → `docs/permissions.md`
- **Pipeline state machine (`advance_stage()`)** → `docs/pipeline.md`
- **Repo layout** → flat at root (D-021). `ls` the directory if you need to know.
- **All non-PRD design decisions** → `decisions.md` (numbered D-001+).
