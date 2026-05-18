# Decisions Log

Every decision made **outside the PRD** is recorded here. The PRD is the spec; this is the addendum.

**How to use this file:**
- Append, never rewrite. Past decisions stay as historical record.
- Each entry: a short heading, date, the decision, the rationale, and any alternative considered.
- If a later decision overrides an earlier one, link back and mark the earlier one `Superseded by D-NNN`.
- Before making a decision that touches an area already covered here, read prior decisions to avoid conflicts.

---

## D-001 — Stack choice: Next.js 15 + Supabase

**Date:** 2026-05-18
**Status:** Active

**Decision:** Next.js 15 (App Router, TypeScript) for the web app; Supabase (Postgres + Auth + Realtime + Storage) for the backend. Tailwind + shadcn/ui for styling. TanStack Query + TanStack Table on the data layer. Hosted on Vercel + Supabase Cloud.

**Why:** Fastest path to a polished real-time multi-user app. Server Components reduce client bundle size for the heavy consignment list views. Supabase Realtime gives us PRD G2 (real-time pipeline view) for free. Aligns with Baraka's existing Supabase familiarity (Lenus App).

**Alternative considered:** Remix + Supabase (less ecosystem); Vite SPA (no SSR, harder reports).

---

## D-002 — Deployment: Cloud (Vercel + Supabase Cloud)

**Date:** 2026-05-18
**Status:** Active

**Decision:** Production runs on Vercel (frontend) and Supabase Cloud (DB/Auth/Storage/Realtime/Edge Functions). Local dev uses Supabase CLI + Docker.

**Why:** Multi-user real-time access is core to the PRD's value proposition; cloud removes the need to maintain a server. Both have free tiers sufficient to start. Switching to self-hosted later is feasible if needed.

---

## D-003 — Excel migration handled in-app

**Date:** 2026-05-18
**Status:** Active

**Decision:** Excel import is a first-class UI feature (per PRD §6.10), not a one-shot CLI. A CLI version (`scripts/import-tracker.ts`) exists for the initial bulk load, but it shares parser code with the UI.

**Why:** PRD §6.10 explicitly requires it. The import logic is also reusable when operators add bulk historical data later.

---

## D-004 — Permission model: Role + per-column overrides

**Date:** 2026-05-18
**Status:** Active

**Decision:** Three system roles (admin, operator, viewer) plus user-defined custom roles. Each role has a per-column read/write matrix on the `consignments`, `efd_records`, `clients`, and `icds` tables. Enforced by Postgres RLS via a `current_user_can_write(table_name, column_name)` function + UI guards.

**Why:** Baraka explicitly asked for admin-controlled column-level write access. Standard role-only systems can't express "this operator can edit pipeline stages but not the amount field."

**Implementation note:** See CLAUDE.md §8 for the table shape and seed logic. The `permissions` UI is built as part of the Settings screens.

---

## D-005 — Workflow: Kanban board + Action inbox (not a spreadsheet)

**Date:** 2026-05-18
**Status:** Active

**Decision:** The primary screen is a **Kanban pipeline board** where each consignment is a card, columns are pipeline stages (Manifest → Shipping Batch → TANESWS → Assessment → TBS Loading → TBS Debit → Manifest Comp → Duty → Inspection → Released). Cards drag forward; backward moves require an admin override + reason.

Alongside it, every user has an **"Action Needed" inbox** showing only the consignments where:
- A stage they're permitted to write is in `Action` state, OR
- A stage they're permitted to write has been `Waiting` past its trigger condition (e.g. Manifest=Uploaded but TANESWS still Waiting), OR
- A consignment they own has a stuck stage (>48h in Action).

A traditional **table view** exists as a secondary view (PRD §9.2), with filters and bulk operations. Sorting/filtering on the table view is fast (TanStack Table) but it is not the daily driver.

**Why:** Baraka explicitly said "not just a clone of Excel." The PRD's #1 pain point is "bottleneck identification is manual." Kanban makes bottlenecks visible at a glance — you literally see the column that's piling up. The inbox makes operators task-focused instead of having to scan the whole sheet.

**Alternative considered:** Pure spreadsheet (familiar but doesn't fix the pain); inbox-only (loses global view); kanban-only (loses per-user focus).

---

## D-006 — Realtime: Supabase Realtime, optimistic UI

**Date:** 2026-05-18
**Status:** Active

**Decision:** Use Supabase Realtime channels on the `consignments` and `efd_records` tables, scoped per active filter (e.g. one channel per year being viewed). Mutations are optimistic in TanStack Query; the realtime event arriving from the server confirms or rolls back.

**Why:** PRD G2 (real-time pipeline view). Solves "no real-time visibility" pain. Optimistic UI keeps stage-advance interactions feeling instant even on slow connections (Tanzania latency to Supabase EU regions ~150-250ms).

**Side note:** Choose the **Supabase EU (Frankfurt/Ireland) region** for the project — generally the lowest latency to East Africa. Will reconfirm when measuring.

---

## D-007 — Migrations via Supabase CLI, never via dashboard

**Date:** 2026-05-18
**Status:** Active

**Decision:** All schema changes live in `supabase/migrations/` as versioned SQL files. Local dev applies them via `supabase db reset` / `supabase migration up`. Remote applies via `supabase db push`. The Supabase Studio UI is read-only for any deployed environment.

**Why:** Prevents drift between developers' local DBs and prod. Gives us a git-trackable schema history. Enables CI to verify migrations apply cleanly on a fresh DB.

---

## D-008 — Time zone: Store UTC, display Africa/Dar_es_Salaam

**Date:** 2026-05-18
**Status:** Active

**Decision:** All `timestamptz` columns store UTC. UI formats with `date-fns-tz` to `Africa/Dar_es_Salaam` (UTC+3, no DST). Date-only fields (`arrival_date`, `release_date`) are `date` type (no time) and represent local Tanzania calendar dates.

**Why:** Tanzania has a single fixed offset, no DST, but storing UTC future-proofs against any expansion and makes audit log ordering correct. Date-only fields stay date-only to avoid timezone-cliff bugs at midnight.

---

## D-009 — Pipeline mutation only through `advance_stage()` SQL function

**Date:** 2026-05-18
**Status:** Active

**Decision:** Direct UPDATE on pipeline stage columns is blocked by RLS for non-admin roles. The only sanctioned path is calling the SQL function `advance_stage(consignment_id, stage, new_value, reason?)`. This function enforces all prerequisites (PRD §8.6–§8.12), writes `stage_history`, and triggers auto-propagation (TBS Debit Paid → Duty Paid).

**Why:** PRD §11 requires data integrity enforced at API level. App-layer checks alone can be bypassed (direct DB access, future second client). Centralizing in a SQL function makes the rules un-bypassable and reviewable in one place.

**Admin escape hatch:** Admins can call `force_set_stage(...)` which bypasses prerequisite checks (logs to audit). Used for fixing data entry errors.

---

## D-010 — REF No collision handling

**Date:** 2026-05-18
**Status:** Active

**Decision:** Unique constraint is `(ref_no, year)`, matching PRD §8.20. During Excel import, any `ref_no` shorter than 7 digits is left-padded with `9` and the row is marked for manual review (an `import_warnings` table row is written). The import UI surfaces these warnings and requires explicit "accept" before commit.

---

## D-011 — GUTA pairing model

**Date:** 2026-05-18
**Status:** Active

**Decision:** Use a dedicated `guta_pairs` join table: `id`, `batch_code`, `parts_consignment_id`, `frames_consignment_id`, `vessel_name`, `client_id`. Both consignments reference each other only via this table, no direct FK on the consignments row. Detection runs as a Postgres trigger on consignment insert/update that looks for the sibling by `(batch_code, vessel_name, client_id)`. Until paired, the row appears in an "Unpaired GUTA" admin queue.

**Why:** Cleaner than self-referencing FK; allows querying "all unpaired" trivially; survives one side being soft-deleted.

---

## D-012 — `in_ref` siblings: single source of truth via `in_ref_batches` table

**Date:** 2026-05-18
**Status:** Active

**Decision:** Don't duplicate `efd_code` / `efd_time` on every consignment row in the same `in_ref`. Instead:
- `in_ref_batches` table: `id`, `client_id`, `year`, `in_ref_code`, `efd_code`, `efd_time`, `created_at`. Unique on (`client_id`, `year`, `in_ref_code`).
- `consignments.in_ref_batch_id` is a nullable FK.
- A view `consignment_with_efd` exposes the joined `efd_code`/`efd_time` to the app so existing queries read naturally.

**Why:** PRD §8.4 says all siblings share the same EFD. Storing it once removes the propagation correctness burden (no trigger needed) and prevents drift.

---

## D-013 — Audit log via Postgres triggers

**Date:** 2026-05-18
**Status:** Active

**Decision:** A single `audit_log` table captures field-level changes for all tracked tables via a generic trigger function `log_table_change()`. Row shape: `id`, `table_name`, `row_id`, `column_name`, `old_value`, `new_value`, `actor_id`, `actor_email`, `occurred_at`. The trigger fires on UPDATE/INSERT/DELETE.

**Why:** PRD §11 requires every field change logged. Triggers can't be bypassed by app code; the function is generic so adding a new tracked table is one line.

---

## D-014 — 48-hour stuck check via SQL view + scheduled job

**Date:** 2026-05-18
**Status:** Active

**Decision:** A view `stuck_stages` computes, for every consignment, whether any stage has been in `Action` for more than the configured threshold (default 48h, configurable per stage in `settings`). The dashboard reads this view live. A Supabase scheduled edge function runs every 30 minutes to email admins about newly-stuck jobs.

**Why:** View is realtime correct (no cron lag for the UI). The scheduled function handles outbound notifications, where occasional latency is acceptable.

---

## D-015 — Soft delete pattern

**Date:** 2026-05-18
**Status:** Active

**Decision:** Every tracked table has `deleted_at timestamptz null`. All RLS SELECT policies filter `deleted_at IS NULL` by default. Admins can view soft-deleted rows via a dedicated "Archive" screen that uses a service-role-backed server action.

---

## D-016 — Package manager: pnpm

**Date:** 2026-05-18
**Status:** Active

**Decision:** Use **pnpm** for the Next.js app. Lockfile is `pnpm-lock.yaml`. Node version pinned in `.nvmrc` and `package.json#engines`.

**Why:** Faster installs, strict dependency resolution prevents the phantom-dependency class of bugs. Aligns with Vercel's first-class support.

---

## D-017 — Money handling

**Date:** 2026-05-18
**Status:** Active

**Decision:** `amount` is stored as `bigint` representing whole TZS (no decimals — TZS has no subunit in practice). All arithmetic in SQL or app code uses integers. Display formatted with `Intl.NumberFormat("en-TZ")` → `TSh 300,000`.

**Why:** Float math on currency is a known footgun. The PRD's amounts are always whole thousands.

---

## D-018 — Testing scope for v1

**Date:** 2026-05-18
**Status:** Active

**Decision:** Unit tests (Vitest) are required for:
- All zod schemas
- All pure functions in `src/server/business-rules/`
- The Excel parser

E2E tests (Playwright) only cover three paths for v1:
1. Login → view kanban → advance a stage.
2. Create new consignment via form.
3. Import an XLSX and confirm.

We do not chase coverage. We chase confidence on the critical paths.

**Why:** This is a v1 from a single-developer team; over-testing slows shipping. The DB-level invariants (triggers, RLS) carry most of the correctness load and are testable via SQL-level fixtures.

---

## D-019 — Skip local Supabase (Docker); use two cloud projects

**Date:** 2026-05-18
**Status:** Active — supersedes parts of D-007 and CLAUDE.md §6

**Decision:** No local Supabase / Docker for v1. Instead, use **two Supabase Cloud projects**:
- `kdl-tracker-dev` — playground, freely breakable, used while developing.
- `kdl-tracker-prod` — production, only receives migrations after they're verified on dev.

The Supabase CLI is still the migration tool — `supabase link` switches between projects, `supabase db push` applies pending migrations, `supabase gen types typescript --linked` regenerates TS types. The Studio UI remains read-only for schema on both projects.

**Why:** Solo developer on Windows. Docker Desktop adds significant overhead (RAM, boot time, occasional WSL2 friction) for a benefit (`db reset`, offline work) that a solo dev rarely needs. Two cloud projects achieve the "test before prod" goal more simply. If we ever scale to 3+ devs, adding local Docker is a one-evening upgrade — the migration files themselves don't change.

**Tradeoff accepted:** Lose the ability to nuke and rebuild the dev DB in 10 seconds. Mitigation: delete and recreate the dev Supabase project (~2 min) if a true clean state is needed.

**Updates to other docs:**
- `humanTasks.md` H-001: Docker removed.
- `humanTasks.md` H-002: now creates two projects.
- `CLAUDE.md` §6: migration workflow updated to use `--linked` instead of `--local`.

## D-020 — Use new Supabase publishable/secret API keys, not legacy anon/service_role

**Date:** 2026-05-18
**Status:** Active

**Decision:** Use Supabase's new API key system from day one:
- **Publishable key** (`sb_publishable_...`) wherever the legacy stack would use the anon key. Lives in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Safe to ship to the browser.
- **Secret key** (`sb_secret_...`) wherever the legacy stack would use service_role. Lives in `SUPABASE_SECRET_KEY` (server-only). Never bundled to the client.

Disable the legacy anon/service_role keys in the Supabase dashboard once the new ones are in use.

**Why:**
- Legacy JWT-based keys are being deprecated end of 2026.
- New keys can be instantly revoked, are individually rotatable, support multiple secret keys per project, and emit audit log entries on use.
- New publishable keys hide the OpenAPI spec — previously anyone with the anon key could enumerate the full table/column structure of the project.
- Starting greenfield in May 2026, there's no migration cost to choosing the new system now.

**Naming convention in our codebase:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  ← (NOT `ANON_KEY`)
- `SUPABASE_SECRET_KEY`  ← (NOT `SERVICE_ROLE_KEY`)

**Edge Function caveat:** New keys do not support automatic JWT verification in Edge Functions. The alerts function (T-053) will use `--no-verify-jwt` and authenticate via a shared `ALERTS_CRON_SECRET` header instead. The function only runs from the Supabase scheduled-job system, so it never has to authenticate an end user.

**Sources:**
- [Upcoming changes to Supabase API Keys (changelog)](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys)
- [Understanding API keys (docs)](https://supabase.com/docs/guides/api/api-keys)

## D-021 — Flat repo structure (no `apps/web/` monorepo)

**Date:** 2026-05-18
**Status:** Active — supersedes the `apps/web/` layout in CLAUDE.md §4

**Decision:** The Next.js app lives at the **repository root**, not inside `apps/web/`. Planning docs (`PRD.md`, `CLAUDE.md`, `tasks.md`, etc.) sit alongside `src/`, `supabase/`, `package.json`, etc. — standard Next.js layout.

**Why:** Solo dev. We only have one app. A monorepo adds tooling complexity (workspace configs, install path scoping, IDE setup) for zero benefit until a second app exists. If we ever add a mobile or admin app, restructuring to `apps/web/ + apps/mobile/` is a one-evening migration.

**New layout:**

```
kingdaoLogistics/
├── PRD.md, CLAUDE.md, tasks.md, etc.   # planning docs at root
├── src/                                # Next.js app source
│   ├── app/                            # App Router pages
│   ├── components/
│   ├── lib/
│   ├── server/
│   ├── schemas/
│   └── types/
├── supabase/                           # migrations, seed, edge functions
├── scripts/                            # one-shot scripts (CLI importer, etc.)
├── tests/                              # vitest + playwright
├── public/                             # static assets
├── package.json, tsconfig.json, next.config.ts, etc.
└── .env.local (gitignored), .env.example (committed)
```

## D-022 — Next.js 16 (not 15) — adopting the new default

**Date:** 2026-05-18
**Status:** Active — updates D-001

**Decision:** Use **Next.js 16.2** (the current default from `create-next-app`), not Next.js 15 as originally specified in D-001. React 19, Tailwind 4, App Router — same architecture, just the newer release.

**Why:** `create-next-app` defaults to Next 16 now. Pinning to 15 would mean fighting the tooling. No breaking changes that affect our planned architecture. Turbopack is now stable and the default — though I disabled it during scaffolding (`--no-turbopack`) for stability on Windows; we can flip it on later if dev startup feels slow.

## D-023 — shadcn/ui on Base UI primitives (not Radix UI)

**Date:** 2026-05-18
**Status:** Active — updates D-001

**Decision:** The shadcn/ui CLI now defaults to the **`base-nova`** preset built on **Base UI** (`@base-ui/react`), not Radix UI. We adopt this default.

**Why:** Base UI is from the same authors as Radix UI and is the actively-developed successor (Radix UI is now in maintenance mode). The current shadcn/ui registry, theming system, and component implementations all assume Base UI. Fighting the default is pointless.

**API differences vs Radix:** Component import paths differ (`@base-ui/react/dialog` instead of `@radix-ui/react-dialog`) but the props and slots-pattern API are intentionally similar.

<!-- Append new decisions below this line. Number sequentially. -->
