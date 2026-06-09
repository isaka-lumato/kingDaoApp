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

## D-024 — `shared_with_consignment_id` (FK), not `shared_primary_ref` (text)

**Date:** 2026-05-18
**Status:** Active — refines PRD §8.9

**Decision:** When `tbs_debit_status = 'SHARED'`, the link to the paying consignment is a UUID FK column `shared_with_consignment_id` on `consignments`, not the textual `ref_no` the PRD suggests.

**Why:** FK gives us referential integrity, survives any `ref_no` corrections, and lets the UI join cleanly to show "shared with REF 9900042". A text column would silently break if ref_no was ever fixed in the source row.

The UI still displays the linked ref_no via `consignments c left join consignments p on c.shared_with_consignment_id = p.id`.

---

## D-025 — Audit log: no partitioning or pruning in v1

**Date:** 2026-05-18
**Status:** Active

**Decision:** `audit_log` is a single unpartitioned table with no automatic pruning. Index on `(table_name, row_id, occurred_at desc)`.

**Why:** Volume estimate is ~8,000 rows/year (400 consignments × ~20 mutations each). Postgres handles millions of rows in a single table trivially. Partitioning, archival, and pruning are premature for v1. Revisit if we ever pass 10M rows.

## D-026 — Server-side reads via admin client (TEMPORARY — to be reverted in T-048)

**Date:** 2026-05-19 (logged retroactively 2026-05-20)
**Status:** Active **but expedient** — must be reverted before Phase 4 production data and before T-081 security review. Tracked by T-048.

**Decision:** Seven server-rendered Next.js pages (`/`, `/inbox`, `/consignments`, `/consignments/[id]`, `/consignments/[id]/edit`, `/consignments/new`, `/settings/users`) and the `fetchKanbanData` server action currently use the **admin Supabase client** (service-role key, RLS-bypassing) for SELECT queries rather than the JWT-bound user client.

**Why it happened:** During Phase 3 build-out, joined queries of the form `select id, ..., clients(name), icds(location) from consignments` returned `null` for the joined columns because `clients` and `icds` had RLS enabled but no SELECT policy for authenticated users. The shortcut taken was to switch the page-level reads to the admin client. A correct fix landed later in migration `025325` (SELECT policies for `clients` and `icds`), but the page-level reads were not switched back.

**Why this is a compromise, not the intended pattern:**
1. **Violates CLAUDE.md §3.2** — the operating doc explicitly says the service-role key is only for "trusted server actions / edge functions" with elevated privileges, not routine reads.
2. **Soft-delete becomes app-enforced, not DB-enforced.** The `consignments_select` RLS policy hides `deleted_at IS NOT NULL` rows from non-admins. The admin client doesn't. Any read path that forgets `.is("deleted_at", null)` will leak archived consignments to viewers. Detail and edit pages currently rely on URL-scope-by-ID, so a viewer with a stale URL can read a soft-deleted row.
3. **Defeats future column-level read permissions** (D-004). If we ever seed `viewer` with `can_read=false` on `amount`, admin-client reads still return `amount` — the UI hides it via `PermissionGate`, but the value reaches the React tree and the network response.

**Cleanup plan (T-048):**
1. Swap `getSupabaseAdminClient()` → `getSupabaseServerClient()` on the 7 read-only call sites.
2. Verify joins return non-null columns (RLS for `clients` and `icds` is in place since migration `025325`, so this should "just work").
3. Add explicit `.is("deleted_at", null)` on every read where it's missing.
4. Manually verify with a viewer, operator, and admin account: each can see what they should and nothing more.
5. Add a `validation.md` V-PERM check that greps for `getSupabaseAdminClient` and lists the only permitted call sites.

**Permitted permanent uses of the admin client** (after T-048):
- `settings/users` mutations (Supabase Admin API requires service role to create users).
- `forceSetStageAction` (admin-only RPC bypassing prerequisites; the function itself is `security definer`, but routing through admin client is consistent with the elevated-operation intent).
- Future Resend / scheduled-edge-function jobs (no end-user JWT to bind to).

**Alternative considered:** `SECURITY DEFINER` views that pre-join the FK lookups. Cleaner long-term and would also solve the future column-level-read story. Deferred to Phase 4+ if needed — Option B (above) is the 1-day fix; the view layer is a refactor we don't need to make today.

---

## D-027 — Pipeline state-machine constants live in `lib/pipeline.ts`, not in server actions

**Date:** 2026-05-19
**Status:** Active

**Decision:** Pipeline enum values, ordered stage list (`PIPELINE_STAGES`), stage-field array (`STAGE_FIELDS`), and the `resolveActiveStage(rowValues)` helper live in `src/lib/pipeline.ts`. They are imported by both client components (`KanbanBoard`, `KanbanCard`, `KanbanColumn`) and server actions (`consignments.ts`).

**Why:** Next.js App Router enforces that a module marked `"use server"` may only export **async functions** (server actions). Non-serializable exports — constants, types, sync helpers — produce a build error. The original Phase 3 attempt put the stage constants in `server/actions/consignments.ts`, which broke as soon as a client component tried to import them. Splitting them into a shared `lib/` module is the canonical fix.

**Convention:** Any "shared between client and server" types, constants, or pure helpers go in `src/lib/`. The `src/server/` tree is reserved for code that touches the secret key or executes server-only effects (revalidation, redirects, server actions).

---

## D-028 — `ref_no` and `serial_no` auto-generated on insert via DB-side defaults

**Date:** 2026-05-19
**Status:** Active — refines PRD §5.1 and §8.20

**Decision:** When a consignment is created via the new-consignment UI, the user does **not** enter a `ref_no` or `serial_no`. The server action computes the next `serial_no` (max + 1 for the current year) and derives `ref_no` from it (left-padded to 7 digits, prefixed `99` for new app-created rows so they're visually distinguishable from imported historical refs). The UI shows the assigned values after submit.

**Why:** PRD §8.20 specifies a REF-padding rule for the **Excel importer** (anything shorter than 7 digits is left-padded with `9` and flagged for review). PRD §5.1 lists `ref_no` and `serial_no` as required fields but does not specify how they're entered. In the original sheet workflow, the operator typed them — but in the app workflow, manually allocating an unused S/N is error-prone (race conditions when two operators create at once, gaps from typos) and adds a step the user doesn't care about. DB-side allocation is correct.

**Importer behavior is unchanged** — historical rows keep their original `ref_no` exactly as in the spreadsheet. Only new-via-UI inserts auto-generate.

**Unique-index protection** — `consignments_ref_no_year_uq (ref_no, year) WHERE deleted_at IS NULL` still applies. If two simultaneous inserts ever collide on serial allocation, the second one fails the unique constraint and the server action retries.

**Alternative considered:** A Postgres sequence per year. Rejected because Postgres sequences are non-transactional (gaps on rollback) and don't easily reset per year without a maintenance job. The "max + 1" lookup is fine at our volume (~400/year).

---

## D-029 — `SECURITY DEFINER` RPCs must check caller role explicitly

**Date:** 2026-05-22
**Status:** Active — refines D-004 (permission model)

**Decision:** Any Postgres function declared `SECURITY DEFINER` that mutates user-facing data **must** check the caller's role inside the function body. RLS policies on the affected tables are not consulted when a `SECURITY DEFINER` function runs (it executes as the function owner), so role enforcement must be coded into the function itself.

**Why this entry exists:** Discovered during T-048 manual verification. A logged-in **viewer** could drag a card on the kanban — the UI had no permission check on forward drags (only on backward drags, which require admin), and `advance_stage()` ran as `SECURITY DEFINER` and bypassed the `consignments_update` RLS policy that would otherwise have refused. The mutation persisted in the DB.

**Fix shipped:** Migration `20260522004757_advance_stage_role_check.sql` added a guard at the top of `advance_stage()` that raises `42501` if the caller is not in `('admin','operator')`. Verified via direct REST RPC: a viewer JWT now returns `"Role admin or operator required to advance pipeline stages"`. Companion UI guard in `kanban-board.tsx` / `kanban-card.tsx` makes cards non-draggable for viewers (`useSortable({ disabled: !canDrag })`).

**Rule going forward:**
1. Audit every existing `SECURITY DEFINER` function in `supabase/migrations/` for caller-role checks. Current inventory:
   - `advance_stage()` — fixed in this migration.
   - `force_set_stage()` — already correct (calls `public.is_admin()` at top).
   - `log_table_change()` — trigger, runs as definer; reads `auth.uid()` but does not mutate based on caller identity, so no role gate needed.
   - `auto_detect_guta_pair()` — trigger, only reads/inserts under the same row's authority; no gate needed.
   - `current_user_can_write()` — pure function, no mutations.
   - `is_admin()` — pure boolean lookup, no mutations.
2. Any **new** `SECURITY DEFINER` function added in Phase 4+ must include a `raise exception` role gate as its first executable statement, **before** the row lock or any pre-condition checks. A comment block at the top must state the allowed roles.
3. `validation.md` V-PERM gains a check: "every `security definer` function that performs INSERT/UPDATE/DELETE on a user-facing table has a caller-role check before the mutation."

**Why the UI guard is not the fix:** Per CLAUDE.md §1, the database is the source of truth for business rules. UI-only guards are bypassable by anyone who can open devtools and call `supabase.rpc()`. The migration is the load-bearing fix; the UI change is UX polish.

**Cost:** Negligible — one `exists` query against `user_roles` and `roles`. The same pattern is already used in `consignments_update`'s `using` clause, so the planner caches it.

---

## D-030 — `getClaims()` for layout auth, React `cache()` for per-request memoisation, user-bound client for `force_set_stage`

**Date:** 2026-05-22
**Status:** Active — refines D-026 (shrinks the admin-client surface by one site) and supports T-049.

**Decision:** Three small changes to the server-side auth pipeline:

1. **Layout uses `auth.getClaims()`, not `auth.getUser()`.** `getClaims()` verifies the JWT locally and returns the user id + email without an Auth-server round-trip. The canonical session refresh + Auth-server verification already happens once per request in `src/middleware.ts` (the Supabase-SSR pattern). Re-verifying in the layout was redundant and added one EU-region RTT per page load.
2. **`getServerPermissions()` is wrapped in React `cache()`.** Every Server Component and Server Action within a single render now shares one resolved permission set instead of refetching. `cache()` is per-request, not cross-request, so revoked roles still take effect on the next navigation.
3. **`forceSetStageAction` calls the RPC via the user-bound server client, not the admin client.** The DB function `force_set_stage()` is `SECURITY DEFINER` and checks `public.is_admin()` at the top — that lookup reads `auth.uid()` from the request JWT. Calling the RPC through the service-role client made `auth.uid()` null, and the guard always rejected with `42501 force_set_stage requires admin role` — including when the actual user was an admin. Server-action-layer permission verification (`perms.isAdmin`) is unchanged and still runs first; the user-client call lets the DB-side guard succeed too. This shrinks the permanent admin-client allowlist from four sites to three (D-026 is amended in place in `validation.md`).

**Why this is a decision, not just a fix:**

- Item 1 changes the contract "the layout independently re-verifies the user with the Auth server" → "the layout trusts the middleware-verified JWT". The middleware is now the only place that hits the Auth server. If we ever stop calling `getUser()` in the middleware (e.g. a future refactor), the layout's `getClaims()` is no longer sufficient and item 1 must be revisited.
- Item 2 means that mid-request permission changes are invisible — if an admin revokes a role *while* a page is rendering, the in-flight render still sees the old permissions. Acceptable for our cadence (revocations are rare and the next request picks up the change).
- Item 3 is the inverse of what D-026 said. D-026 listed `forceSetStageAction` as a permitted permanent admin-client use ("admin-only RPC bypassing prerequisites; routing through admin client is consistent with the elevated-operation intent"). T-049's manual verification proved the opposite — routing through the admin client *broke* the DB-side guard. The rule going forward: **`SECURITY DEFINER` RPCs that read `auth.uid()` must be called via the user-bound client, even when the server action has already verified admin status.**

**Measured impact (T-049 acceptance):**

- `GET /` `application-code` time (the layer T-049 targets, distinct from middleware's `proxy.ts` time which is unchanged) dropped from ~1500–2000ms (pre-T-049, observed during the 2026-05-20 audit) to **31–169ms warm** on the dev box against the kdl-tracker-dev project. Far past the ≥50% threshold.
- `forceSetStageAction` for an admin (drag backward on the kanban) now returns `200` with the row updated, where the prior build returned the `42501 admin role` error.

**Alternative considered:** Cache permissions across requests (e.g. in a session cookie). Rejected because it complicates revocation semantics for a fix that doesn't need it — `cache()` already collapses N permission fetches within one request to one.

---

## D-031 — Stuck-alert dedup via `stuck_alerts` ledger table

**Date:** 2026-05-23
**Status:** Active — supports T-053.

**Decision:** Track which `(consignment_id, stage)` pairs have already been emailed in a dedicated `public.stuck_alerts` table. The alerts edge function calls two SQL helpers on every run:

1. `reset_resolved_stuck_alerts()` — DELETE ledger rows whose pair no longer appears in `v_stuck_stages` (the stage has been advanced out of Action). Returning to Action later is then re-alertable.
2. `claim_new_stuck_alerts()` — `INSERT … FROM v_stuck_stages ON CONFLICT DO NOTHING RETURNING …`. Atomic claim; concurrent invocations cannot return the same row.

**Why a table, not a time-window heuristic:** A heuristic like "alert when elapsed crosses 48h in the last 30 min" is fragile — missed cron runs (Supabase Functions cold starts, deploy windows) silently drop alerts; clock drift can double-fire. The ledger turns the question into a SQL set difference that's correct regardless of how many times the function runs or how long since the last run.

**Why DELETE on resolve rather than `resolved_at` flag:** The simplest correct semantic is "if you're not in `stuck_alerts` and you are in `v_stuck_stages`, you're new". DELETE keeps the table small (one row per currently-stuck pair) and makes `claim_new_stuck_alerts()` a single ON CONFLICT statement. The `resolved_at` column on the table is reserved for future analytics ("how long was each job in stuck state?") and is left null in v1.

**RLS:** SELECT for authenticated (admins occasionally want to see what's been alerted). No INSERT/UPDATE/DELETE policies — the table is mutated only via the `SECURITY DEFINER` helpers, which the edge function calls with the service role.

---

## D-032 — Stuck-job alerts go to admins as a digest, not per-job

**Date:** 2026-05-23
**Status:** Active — supports T-053.

**Decision:** Each scheduled run of the alerts function sends **at most one digest email per admin user**, listing every newly-stuck `(cid, stage)` claimed on that run. Admins are resolved at run time as every user assigned to the `admin` role via `public.user_roles` + `public.roles`. Their emails are looked up via the Supabase Auth Admin API (`auth.admin.getUserById`).

**Why a digest:** A small Tanzanian customs office has ~5–15 active consignments and 1–3 admins. Per-row emails would flood inboxes during a bad week (vessel delay → 10 jobs stuck simultaneously). One digest per admin per 30-min run is the equivalent of a status report.

**Why not a single ops mailbox:** PRD §6.8 says "notify admin". Hard-coding one address (a) couples the alert to whoever owns that mailbox today (b) hides admins from the loop when they're added. Resolving the admin role dynamically means new admins start receiving alerts automatically.

**Sender:** `ALERTS_FROM` env var on the edge function. In dev/sandbox this is Resend's default sender (H-004); for production we'll switch to a verified domain sender (H-008).

---

## D-033 — Resend HTTP API direct from edge function, no SDK

**Date:** 2026-05-23
**Status:** Active — supports T-053.

**Decision:** The alerts edge function POSTs directly to `https://api.resend.com/emails` via `fetch`. We do **not** pull in `resend` / `@resend/node` or any third-party SDK.

**Why:** The Supabase Functions runtime is Deno-based, cold-start sensitive, and limited to `https://esm.sh` for third-party modules. The Resend HTTP API is a single endpoint with a tiny JSON body — wrapping it in an SDK adds ~100 KB of bundled code and one more dependency to keep current. A 20-line `sendViaResend(...)` helper is clearer, cheaper, and easier to audit.

**Trade-off:** We re-implement small things the SDK gives us (typed error shapes, retries). The function logs every non-2xx response from Resend with the status + first 500 chars of the body, which is enough to debug a misconfigured API key or rate-limit. Retries are intentionally not added in v1 — the cron re-fires in 30 min and `claim_new_stuck_alerts` is idempotent across retries.

---

## D-034 — Mobile pipeline view: single-stage list + tap-to-advance, not DnD kanban

**Date:** 2026-05-24
**Status:** Active — supports T-080 (mobile responsive pass) and a new T-086 (mobile pipeline view).

**Decision:** On viewports below the `md` breakpoint (`< 768px`), `/` (the Pipeline route) does **not** render the 10-column DnD kanban. Instead it renders:

1. A sticky stage selector at the top of the page — segmented control or dropdown listing the 10 pipeline stages plus a "Released" tab — defaulting to the first stage with at least one card the user can act on (fall back to `Manifest`).
2. A vertical list of cards for the selected stage only (same card component as desktop, full-width).
3. Tapping a card opens an action sheet with: "Open detail" → `/consignments/[id]`, and **"Advance to next stage"** (admin/operator only, hidden for viewers per D-029). The advance action calls the existing `advanceStageAction` server action — same RPC, same RLS, same prerequisite checks as desktop DnD.
4. Backward moves (admin only) live in the action sheet as "Move to stage…" → opens the existing `forceSetStageAction` dialog. Reason input is required, same as desktop.

The desktop kanban (`md` and up) is unchanged.

**Why ditch DnD on mobile:** Touch-dragging a card across 10 horizontal columns on a 375px viewport is unworkable. `@dnd-kit`'s touch sensor handles single-column DnD fine but the cross-column UX requires horizontal scrolling the board *while* dragging, which fights the browser's own scroll gesture. PRD §11 calls for the app to "work on mobile" — that's a usability bar, not a "render the desktop layout shrunk down" bar.

**Why a single-stage list, not a swipeable carousel of mini-columns:** Pipeline overview is already covered by `/dashboard` (funnel chart, KPI tiles) and per-user focus is covered by `/inbox`. The mobile Pipeline view's remaining job is "let me move my card forward" — which a list + button does better than any DnD substitute. A carousel adds a navigation layer (swipe between stages) without adding capability over a sticky stage picker.

**Alternative considered:**
- *Long-press card → "Move to…" picker on the existing horizontal-scroll kanban.* Rejected: still requires horizontal-scrolling 10 columns to find the card; the picker duplicates what a single-stage view already gives you.
- *Hide the kanban on mobile and force users to `/consignments` table.* Rejected: the table is dense and filter-driven; the pipeline view's signature affordance ("here's what's in my stage") disappears.
- *Render only the user's actionable stages.* Rejected: too clever — admins want to see every stage; the sticky selector handles this with one tap.

**Implementation notes (for T-086):**
- Reuse `kanban-card.tsx`'s presentational pieces; do not reuse `useSortable`/`useDroppable`.
- The stage selector reads the same `PIPELINE_STAGES` constant the kanban does (`lib/pipeline.ts`).
- Realtime: subscribe to `consignments` changes (same channel as desktop) and re-merge into the visible list via `setQueryData`, same as the kanban does — when a card advances out of the selected stage, it disappears from the list.
- Action-sheet "Advance" must surface server-action errors (prerequisite failures from `advance_stage()`) as a toast, same as desktop drag-end.
- The `< md` switch happens in the page component, not via CSS — we don't want `@dnd-kit` mounting at all on mobile (it bumps a module-level counter that's already a known hydration warning source; see `status.md`).

**Out of scope for D-034:** Mobile-specific designs for `/inbox`, `/consignments`, `/efd`, `/dashboard`, and the consignment detail view. Those are covered by T-080's broader mobile pass.

---

## D-035 — Excel parser is pure over `CellValue[][]`, SheetJS lives in adapters

**Date:** 2026-05-24
**Status:** Active — supports T-060 / T-061 / T-062.

**Decision:** `src/server/import/parse-tracker.ts` exports a pure function `parseTracker(rows: CellValue[][])` that returns `{ consignments, efds, errors, warnings, summary }`. It does **not** import `xlsx` (SheetJS) or read files. Reading the workbook → 2D array of cell values is the job of two thin adapters:

- T-061 (UI) — a server action accepts an uploaded file, runs `XLSX.read(...)`, calls `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })`, hands rows to `parseTracker`.
- T-062 (CLI) — `scripts/import-tracker.ts` does the same, against a local path.

**Why:** Three reasons.

1. **Testability.** Unit tests for every PRD §10.3 / §8.20 rule can build the input as plain TypeScript arrays — no `.xlsx` fixtures committed, no SheetJS in the test runner, no flake on cell-type coercion. Per the T-060 question round we chose synthetic fixtures only.
2. **Smaller blast radius.** SheetJS is ~500KB and brings WASM. Keeping it out of the parser means the parser stays cheap to import from anywhere (e.g. a row-by-row preview validator in T-061's UI). It also defers the dep install — `xlsx` is still the locked choice per CLAUDE.md §2, but we don't add it until T-061 lands.
3. **Forward compatibility with `exceljs` (writer).** PRD §6.9 reports export via `exceljs`. Keeping read/write libs in adapter modules means we don't accidentally couple the parser to one library.

**`CellValue` shape:** `string | number | boolean | Date | null`. Matches `XLSX.utils.sheet_to_json(..., { raw: true })` output. Adapters are responsible for surface-level normalisation (e.g. stripping leading apostrophes from text-formatted numbers); the parser still defends against ambiguity by coercing once at the field level.

**Trade-off:** Adapters are tested separately at T-061 / T-062 time (smaller surface — just "did the workbook open and yield the right shape"). The risk of a SheetJS quirk slipping past is bounded because each adapter passes rows through the same `parseTracker` and the same per-rule errors fire downstream.

---

## D-036 — Excel parser is header-driven, two-bucket output (errors block, warnings inform)

**Date:** 2026-05-24
**Status:** Active — supports T-060.

**Decision:**

1. **Column resolution is header-driven**, not positional. Each yearly section is expected to begin with a header row whose cells contain the labels from PRD §5's "Source Column" column (e.g. `REF No`, `TANSAD No.`, `B/L No.`, `No. of Cont(s)`, `CLIENT`, …). Matching is case-insensitive and whitespace-tolerant (collapses runs of spaces, trims, ignores trailing punctuation `.`/`:`).
2. Year-separator rows (a single non-empty cell whose value parses as a 4-digit year, all other cells empty) flip the active year. The next non-empty row is treated as the section header.
3. **Output is two buckets**:
   - `errors[]` — the row was **not** included in `consignments`. Reasons: missing `ref_no` *and* missing `tansad_no` (treated as empty per PRD §10.3, but classified as `skipped`, not `error`); year never established before the first data row; unrecoverable parse (e.g. `container_type` value not in the enum and not blank).
   - `warnings[]` — the row **was** included in `consignments` but has a soft issue worth surfacing in the import UI. Examples: amount outside the §8.5 range for the container type + count; `ref_no` < 7 digits and was auto-padded with leading `9` (PRD §8.20 "flag for manual review"); `tanesws_status = Done` but `tansad_no` is null (§8.19); `container_type = COIL` but `icd_name ≠ DP WORLD` (§8.5).
4. Each entry in either bucket carries `{ rowIndex, refNo?, field?, message }`. `rowIndex` is the 0-based offset into the input `rows` array — the UI can map back to the user's file line number by adding 1 (or +2 if it wants 1-based Excel rows including the header).
5. **Skipped rows** (empty rows per §10.3, and year-separator rows) are not errors. They're counted in `summary.skipped` and don't appear in either bucket.

**Why header-driven:** Future tracker files may have columns added/removed/reordered without breaking the import. Position-based parsing means every tracker variation requires a code change. The PRD lists 28 source columns; matching by header keeps the parser robust to small layout drift.

**Why two buckets:** PRD §8.5 explicitly says amount-out-of-range is "yellow warning, not a hard block." Combining errors + warnings into one severity-tagged list (the alternative) forces every UI caller to filter twice. Two buckets means the T-061 preview can render them in two distinct panels with no logic.

**Open question for T-061 (not T-060):** Whether warnings should require operator acknowledgement before "Confirm import" enables, or just display. Defer.

---

## D-037 — Excel import commit: row-by-row, auto-create missing clients/ICDs, `import_jobs` audit row

**Date:** 2026-05-24
**Status:** Active — supports T-061.

**Decision:** The "Confirm import" server action commits as follows:

1. **One row at a time, per-row error capture.** Uses `getSupabaseServerClient()` (user JWT, RLS applies). For each parsed consignment row: resolve client_name → client_id and icd_name → icd_id (case-insensitive `name ilike` lookup, plus an in-process cache so a 400-row import does at most one query per distinct client/ICD); insert the consignment row; insert any EFD records from `efd_codes`. A failure on one row records the row index + error message in the job's payload and continues. Final stats: `{ inserted, skipped, errors }`.

2. **Auto-create missing clients and ICDs.** If `client_name` doesn't match an existing `clients.name` (case-insensitive), insert `{ name: uppercased(client_name), sub_label: null }` and use the new id. Same for ICDs (insert `{ location: titleCased(icd_name) }`). Each auto-create is recorded in the job payload under `auto_created: { clients: [...], icds: [...] }` so an admin can review afterwards. This reflects how the existing tracker grew organically; PRD §13.1 explicitly notes the reference lists were "from source data."

3. **`import_jobs` audit table.** New migration adds:
   ```
   import_jobs(
     id uuid pk default gen_random_uuid(),
     user_id uuid references auth.users(id),
     filename text,
     status text check (status in ('previewed','committed','failed')),
     parsed_count int,
     errors_count int,
     warnings_count int,
     inserted_count int,
     payload jsonb,             -- full preview snapshot: errors, warnings, summary, auto_created
     created_at timestamptz default now(),
     committed_at timestamptz
   );
   ```
   RLS: admins SELECT all; non-admins SELECT only their own rows. INSERT/UPDATE permitted to admin + operator (the roles allowed to import). The preview server action inserts a `previewed` row; the confirm action updates it to `committed` with `committed_at` + `inserted_count`. This gives us a complete record of every import attempt without coupling to the consignments audit log.

**Why row-by-row over an atomic RPC:** A single transactional `commit_import(payload jsonb)` RPC is safer (all-or-nothing) but pushes client_name resolution and FK lookups into SQL, which is harder to test and slower to evolve. With ~400 rows/year and the parser already weeding out hard errors before commit, partial commits are the right trade — the operator sees exactly which rows failed and can fix them in the source sheet.

**Why auto-create:** Blocking on unknown FKs sounds safer but in practice means a typo in one row (e.g. `PAPA - SAAJT` vs `PAPA-SAAJT`) cascades into "fix all rows, re-upload" loops. Auto-creating + flagging in the preview lets an admin reconcile after the fact (merge two near-duplicate clients) — far less friction. Trade-off accepted: occasional duplicate client rows that an admin merges manually.

**Preview is read-only.** Uploading the file and parsing happens entirely in the server action; nothing writes to the DB until "Confirm." The preview response is the parsed shape (consignments / errors / warnings / summary / auto_create previews) — same JSON the confirm step will use.

---

## D-038 — CLI tracker importer: admin client, dry-run default, no shared helper

**Date:** 2026-05-26
**Status:** Active

**Decision:** T-062 ships `scripts/import-tracker.ts` as a Node CLI run via `tsx`, with:

1. **Admin (service-key) client** built inline from `.env.local`, same pattern as `scripts/create-viewer-user.mjs`. Bypasses RLS. No login flow. Rows inserted by the CLI carry `audit_log.actor_id = NULL` because `auth.uid()` is null under the service role — this is acceptable for the historical bulk load because the `import_jobs` row (one per attempt) provides the operator/source/filename provenance instead.
2. **Dry-run by default**, `--commit` required to write. `--commit` additionally requires typing `IMPORT` on stdin (skip with `--yes` for non-interactive runs). Belt-and-braces against an accidental `npm run import:tracker file.xlsx` flooding the DB.
3. **`--no-auto-create` safety valve** — fails fast if any client or ICD would need to be created. Not in the UI; the CLI is the right place for the more conservative policy because the historical load runs on a freshly seeded project where every "missing" name probably indicates a typo worth investigating, not an intended new entity.
4. **No shared `commit-rows.ts` helper** between `import-actions.ts` (UI) and `import-tracker.ts` (CLI). Two call sites is below the rule-of-three; the inner loops differ in auth model, revalidation, progress reporting, and the auto-create policy knob. If T-084 (prod import) introduces a third site, extract then.
5. **No transaction wrapping** the commit loop. Same posture as `commitImportAction` — per-row inserts, failures captured in `import_jobs.payload.failures`. Postgres can hold a transaction over hundreds of rows, but the cross-table EFD inserts plus the FK auto-create branches make a single transaction harder to reason about than the current "loud per-row failures with full provenance in `import_jobs`" model.

**Defaults locked by user (2026-05-26):** auth model = admin client; dry-run = default; target project = whatever's in `.env.local` (no project-switch flag — operator edits the env file or passes `--env-file`).

**Why not authenticate the CLI as an operator:** Reading the operator's password / running a full Supabase Auth login from a CLI adds an interactive dance the historical load doesn't need. The CLI is admin-only by virtue of having the secret key on the operator's disk; gatekeeping access via filesystem permission on `.env.local` is the same posture every other one-off script in `scripts/` already uses.

**Why not reuse the `/import` server action via fetch:** Would require the dev server up, would re-implement file-multipart uploads from Node, and would still need a separate admin-auth path. The CLI duplicates ~150 lines of `commitImportAction` and that's cheaper.

**Verification surface:** V-IMPORT-CLI in `validation.md`.

---

## D-039 — Reports screen: date range only where the view supports it

**Date:** 2026-05-26
**Status:** Active

**Decision:** The `/reports` filter bar always shows a year selector + From/To date inputs, but the date inputs are **disabled** for reports backed by year-grain views (Client Volume, Turnaround · by Client, Turnaround · by ICD, Pipeline Bottleneck). The disabled state carries an inline note ("Date range not applicable — this report is aggregated by year"). For Revenue Summary the range filters on the view's `month` column (`gte` / `lte` against the first-of-month date); for Pending Refunds it filters on `release_date`.

**Why:** PRD §8.5 names "Date range picker" generically, but the underlying T-024 views were intentionally aggregated at the year level (the grain is correct for those reports — average days-by-client over an arbitrary 17-day window in March is meaningless). Two paths considered:

1. **Show a date picker on every report and silently ignore the day part for year-grain reports.** Cleanest visual UI but lies to the user about what the filter does.
2. **Drop the picker entirely.** Matches the data but ignores PRD §8.5.
3. **(Chosen)** Show the picker, disable it where it's a no-op, explain why.

This keeps PRD §8.5 satisfied while making the filter's effective scope visible. When/if the views are augmented to expose finer grain (e.g. `v_client_volume_monthly`), the disabled flag flips in `REPORT_OPTIONS` and the existing filter wiring picks it up without UI changes.

**No new tasks or views planned to add finer grain in v1** — operators can drill into specific months via the `consignments` table filters and the dashboard's "Revenue this month" tile.

**Verification surface:** V-REPORTS in `validation.md`.

---

## D-040 — Middleware auth: getClaims fast path + near-expiry getUser refresh

**Date:** 2026-05-26
**Status:** Active

**Decision:** The Next.js middleware switches from unconditional `supabase.auth.getUser()` (a ~300ms round-trip to the Supabase Auth server) to a two-tier strategy:

1. **Fast path (every request):** `supabase.auth.getClaims()`. With the asymmetric `sb_publishable_…` keys we adopted in D-020, the JWT signature is verifiable locally — measured at 4–12ms in dev. Used for the auth gate on every protected request.
2. **Refresh path (only when needed):** if `claims.exp - now() < 5 minutes`, call `getUser()` which talks to the Auth server and triggers the SSR client's `setAll()` cookie callback. That rotates the access + refresh tokens onto the response cookies, the same way the old always-call-getUser flow did.

**Why:** the perf instrumentation showed `middleware:getUser` averaging 297–412ms per request — a hard floor on every page navigation, regardless of what the page does. With three to four sequential 300ms calls stacking up (middleware + permissions + page query), the app feels sluggish even though the DB work is sub-10ms. The fast path eliminates ~300ms from every navigation that doesn't need a token refresh, which is the overwhelming majority of them.

**Trust model trade-off:** a server-side session invalidation (admin revoke, password change, ban) does **not** take effect until the next refresh window — at most 5 minutes of "the JWT still works after revoke." Acceptable for an internal-staff app with ~10 named users. If we ever need immediate cross-session revocation we rotate the JWT signing key in the Supabase dashboard (forces every active JWT to fail signature verification on the next request).

**Why not "call `getUser()` every Nth request":** N either has to be small (back to ~300ms often) or large (cookie rotation lags worse than the JWT TTL). The expiry-window heuristic gives exactly one refresh per session window, which is the minimum needed for the cookie chain to stay alive.

**Why not drop middleware entirely:** the `(app)` layout still needs an auth gate, and middleware is the only place that can cleanly rotate the auth cookies via Next's request/response object pair. Layout-level redirects can't write cookies onto the same response.

**Expected savings (from perf logs, before/after):**
- Per-request middleware cost: 297–412ms → 4–12ms when token is fresh.
- `/` (kanban): 815ms → ~500ms.
- `/consignments`: 1267ms → ~950ms (still hitting #2 + #3 on the optimization list).
- `/dashboard`: similar ~300ms drop.

**Verification surface:** existing perf-log lines `[perf] middleware:auth … mode=getClaims` vs `mode=getUser`. After-the-fact: navigate around for ~10 minutes, expect to see exactly one `mode=getUser` line at the start of each ~1-hour session window. Functional checks: login still works (forces a refresh; expect `mode=getUser` on the first protected hit), logout still clears cookies, expired JWT still redirects to `/login`.

---

## D-041 — Cross-request permissions cache (in-process Map, 5-min TTL)

**Date:** 2026-05-26
**Status:** Active

**Decision:** `getServerPermissions()` now consults an in-process module-scoped `Map<userId, CachedPermissions>` before hitting the DB. Entries live for 5 minutes; on cache hit no `user_roles` / `role_column_permissions` queries fire. Hits return in under a millisecond; misses pay the existing ~310–375ms DB cost and write-through. The hydration step rebuilds the `canRead` / `canWrite` closures over the cached `columns` array on every call rather than serialising functions into the cache.

**Why:** the perf instrumentation showed the layout's `getServerPermissions()` call costing 306–414ms on every protected page navigation, dominated by the `user_roles` query (307–368ms — pure network RTT to West Europe, not DB work). Roles change ≤ once per month in this app. Caching them per-process eliminates the floor on every protected page navigation.

**Cache layer architecture:**
- **React `cache()`** wraps `getServerPermissions()` for per-request memoisation (one resolved set per render, regardless of how many Server Components call it).
- **New module `src/lib/permissions-cache.ts`** wraps the DB query for cross-request memoisation (one resolved set per user per 5-min window, regardless of how many requests they make).

Together: a logged-in admin clicking between Dashboard / Pipeline / Consignments / EFD pays one ~310ms permissions fetch every 5 minutes instead of one per navigation.

**Invalidation (proactive):**
- `inviteUserAction`, `assignRoleAction`, `removeRoleAction` → `invalidatePermissionsCache(userId)` (per-user; only the affected user's cache is dropped).
- `deactivateUserAction`, `reactivateUserAction` → `invalidatePermissionsCache(userId)` (defence-in-depth; a banned user's JWT *should* fail to refresh, but we drop the cache regardless so the next request can't pull a stale "still valid" payload from the optimistic-cache path).
- `updateColumnPermAction`, `deleteRoleAction` → `invalidatePermissionsCacheAll()` (one column toggle on `viewer` affects every viewer; enumerating ~10 staff users is more code than clearing the whole map, and the warm-up cost is one 310ms refetch per active session).
- **Not invalidated:** `createRoleAction` (the new role has no users yet, no cached payload references it).

**Invalidation (passive):** TTL bounds worst-case staleness at 5 minutes even if a future code path bypasses the explicit invalidation hooks above. A 5-minute window is acceptable for an internal-staff app where permissions changes are rare and the deploying admin can ask the affected user to refresh.

**Multi-process scope:** the cache is a Node `Map`, scoped to one server process. On Vercel each serverless instance keeps its own map and warms independently — fine, because:

1. The TTL is short, so cross-instance divergence is bounded.
2. Mutations write through `invalidatePermissions…()` on whatever instance handles the action, but other instances' caches keep stale entries until they TTL out. This is the same "≤ 5 min staleness" envelope as the natural TTL.
3. There's no PII in the cache beyond what the JWT already carries (userId, email, role names, table+column names).

**Why not Redis / external cache:** an internal-staff app with ~10 users does not need it. Per-process is sufficient and removes an infra moving part. Reassess if the app ever serves > 100 concurrent users or if mutations need cross-instance invalidation guarantees.

**Why not signed cookies:** they'd survive cold starts but pay a 1–2 KB cookie cost on every request and force a serialisation/HMAC step. The Map is faster and simpler; the cold-start cost we're trading off is at most one 310ms refetch.

**Expected savings (from perf logs, before/after):**
- Per-request `getServerPermissions()` cost: 306–414ms → < 1ms when cached.
- `/` (kanban) on a warm cache: ~500ms (after D-040) → ~200ms.
- `/consignments`: ~950ms (after D-040) → ~650ms.
- `/settings/users`: ~2.1s → ~1.3s (the deeper queries inside that page are not yet optimised).

**Verification surface:** new perf-log lines `[perf] permissions total=… | … result=cache-hit` vs `result=cache-miss`. Manual: after one fresh load, every subsequent navigation in the next 5 minutes should log `result=cache-hit roles=N`. Mutation: edit a role's column permissions → next navigation logs `result=cache-miss` (cache was cleared). Per-user invalidation: assign a role to user X → only X's next request logs a miss; other users keep their cached entries.

---

## D-042 — `/consignments` data fetch: parallel tier-1, optional tier-2 for stuck filter

**Date:** 2026-05-26
**Status:** Active

**Decision:** The `/consignments` server component restructured from three serial queries to one (or two) parallel batches:

- **Default / `stage=unreleased` / `stage=` (no filter):** one parallel batch — `clients-dropdown` + main `consignments` query fire as a `Promise.all`. Two RTTs collapse into one wait window of ~max(368, 312)ms.
- **`stage=stuck`:** two tiers — tier 1 fires `clients-dropdown` + `v_stuck_stages` in parallel, tier 2 fires the main `consignments` query with the resolved `stuckIds.in(...)` filter applied. Three RTTs collapse into two waits of ~max(368, view-cost) + ~312ms.

A small `buildConsignmentsQuery(stuckIds: string[] | null)` closure inside the page builds the Supabase query builder with all the current `params.{client,stage,q}` filters applied; passing `null` for `stuckIds` means "no stuck filter," passing `string[]` (even empty) applies it.

**Why:** the perf instrumentation showed `clients-dropdown` (368ms) and `consignments-query` (312ms) running back-to-back on every `/consignments` load — 680ms of pure network waiting. The two queries are fully independent. The stuck-filter branch was even worse: three sequential network hops because `v_stuck_stages` blocked the main query.

**Why a closure, not a top-level helper:** the query references `supabase`, `year`, `from`, `pageSize`, and `params`, all of which are request-scoped. Hoisting it would require threading those through as arguments and re-creating the closure on every render anyway. The inner closure is the simpler form.

**Why typed `ConsignmentRow = Record<string, unknown> & { clients: … }`:** the `mainRes.data` shape needs to type-narrow for the `.map((row) => ({ ...row, clients: … }))` normalize step, but the rest of the page just casts the array to `any` at the JSX boundary (a pre-existing pattern, matching how the rows are consumed by the client component). A precise generated type from `Database['public']['Tables']['consignments']['Row']` would require re-deriving the `clients` join shape and is more work than the wide-but-correct alias.

**Why not also parallelize the GUTA-pair sibling fetch on `/consignments/[id]`:** the detail page is already fully parallelized for the four independent queries (consignment + client + ICD + audit + EFD links). The GUTA-pair fetch is conditional on `consignment.guta_pair_id` and depends on the main consignment row — moving it into the parallel batch would require fetching the pair unconditionally, which would waste a query on every non-GUTA consignment (the majority).

**Expected savings (from perf logs, before/after, on a warm permissions cache from D-041):**
- `/consignments` default load: ~650ms → ~370ms (savings of ~280ms).
- `/consignments?stage=stuck`: was 3 serial RTTs, now 2 — savings depend on `v_stuck_stages` cost; if the view is fast (~100ms server execution) the page goes from ~1.0s → ~700ms.
- Net effect of D-040 + D-041 + D-042 on `/consignments`: 1267ms → ~370ms (warm cache) / ~700ms (cold permissions).

**Verification surface:** perf-log lines on `/consignments` change shape — instead of `clients-dropdown=368 consignments-query=312` separately, look for `tier1-clients+consignments=…` (default case) or `tier1-clients+stuck=… tier2-consignments=…` (stuck case). The wall-clock `total=` should drop by the amount the smaller of the two parallel queries used to consume. Manual: navigate `/consignments`, `/consignments?stage=unreleased`, `/consignments?stage=stuck`, `/consignments?client=<uuid>`, `/consignments?q=ref` — all should render with the same data they rendered before (no rows added or dropped) and noticeably faster.

---

## D-043 — `/consignments` filter bar: useTransition + soft-nav for in-page filters

**Date:** 2026-05-26
**Status:** Active

**Decision:** The `/consignments` client filter bar now wraps every navigation in `React.useTransition`:

- Client/stage `<select>` `onChange` handlers, the search form `onSubmit`, and the year tabs / pagination links all go through a single `navigate(href)` helper that calls `startTransition(() => router.push(href))`.
- Year tabs and pagination switched from raw `<a href>` to `next/link <Link>` — they were previously triggering full-page hard reloads, which doubled the apparent slowness on those interactions and bypassed the route's `loading.tsx` skeleton.
- The table receives `opacity-60` while `isPending`, so the stale rows stay readable but visibly "in-flight."
- An inline "Updating…" spinner appears in the filter bar with `aria-live="polite"` so the indicator is announced to screen readers when navigation starts.

**Why:** without `useTransition`, every filter change unmounts the existing table and re-mounts the route's `loading.tsx` skeleton. That feels like the page is being torn down and rebuilt for what is functionally a small re-query. With `useTransition`, the previous render stays painted; only the new data fades in. The change is purely UX — no Supabase queries change, no extra round-trips.

The year-tab / pagination `<a>` bug is a separate but adjacent fix: hard navs reset all client state (scroll position, filter selections, etc.) and download the JS bundle again. `<Link>` keeps the SPA cache hot.

**Why not also skeleton-ize per-cell content while pending:** the row-level opacity is the right granularity — cell-by-cell shimmering on every filter would be noisier than helpful. Industry pattern is "fade the table, show a pill saying it's updating," which is what we land on.

**Why not `useOptimistic`:** the filter doesn't apply an optimistic mutation — it kicks off a server query whose results aren't predictable client-side. `useOptimistic` is for when you can guess the next state (e.g., a toggle); we can't here.

**Verification surface:** click any filter dropdown or pagination link and watch the table — it should stay visible at 60% opacity with the "Updating…" indicator until the new rows arrive. No skeleton flash.

---

## D-044 — `/settings/users` parallelization (inner + outer)

**Date:** 2026-05-26
**Status:** Active

**Decision:** Two cuts in the same chain to collapse three serial RTTs into one parallel batch:

1. **Inside `listUsersAction()`:** `admin.auth.admin.listUsers({ perPage: 200 })` (Supabase Auth API) and `admin.from("user_roles").select("user_id, roles(id, name)")` (DB) are now fired in `Promise.all` — they're fully independent (one talks to GoTrue, the other to PostgREST). Was 2 serial RTTs (~600ms), now 1 (~300ms).
2. **Inside `/settings/users/page.tsx`:** the `roles` dropdown query and `listUsersAction()` are now in `Promise.all` — also independent. Combined with #1, the whole page-data fetch is one parallel batch instead of a 3-RTT chain.

The page also gets a `perfTimer("settings-users")` so we can see the cut land in the logs.

**Why:** the original perf log showed `/settings/users` at 2.1s end-to-end with `application-code=1655ms`. Three serial round-trips of ~300–500ms each accounts for the wall-clock cost; the queries themselves return in single-digit milliseconds. Even with D-040 + D-041 (which cut ~600ms of auth/permissions overhead off the top), the page was still ~1.3s. This change drops the data-fetch portion to one ~300ms wait.

**Why not also batch the auth.listUsers + user_roles via an RPC:** would require a new SECURITY DEFINER PG function plus a roundabout way to enumerate Auth users from SQL (the admin schema isn't joinable). Two RTTs reduced to one parallel batch is the same outcome with no DB-side work.

**Why `listUsersAction` keeps its admin client:** Supabase's `auth.admin.listUsers` requires the service role key — there's no user-bound equivalent. D-026 allowlist already includes this usage. No new admin-client sites added.

**Expected savings (from perf logs, before/after, on a warm permissions cache from D-041):**
- `/settings/users`: ~1300ms → ~600ms (warm) / ~900ms (cold permissions).
- Cumulative with D-040 + D-041: 2100ms → 600ms warm = ~70% reduction.

**Verification surface:** new perf-log line `[perf] settings-users total=… | … parallel-roles+listUsers=…`. The `parallel-roles+listUsers` segment should be roughly the larger of the two independent queries, not their sum. Functional: page renders the same user list with the same role badges as before.

---

## D-045 — Triage view classifier rule (replaces kanban as default on mobile)

**Date:** 2026-05-28
**Status:** Active

**Decision:** A consignment's triage bucket is derived from its **active stage** (the first stage in `PIPELINE_STAGES` order whose value is not its `doneValue`) and the value of that stage:

| Active-stage value                                          | Bucket          |
|-------------------------------------------------------------|-----------------|
| `"Action"`, `"PREPARED"`, `"W/CARRY IN"`, `"CARRY IN END"`, `"SHARED"` | **Action Needed** |
| `"Waiting"`                                                 | **Waiting**     |
| No active stage (every stage at its `doneValue`)            | **Done**        |

A row in **Action Needed** whose `updated_at` is older than 48 hours is additionally flagged **Stuck** (red), per PRD §6.8. The 48h clock uses the existing `updated_at` column — we are not introducing per-stage timestamps for this view (see "Why not" below).

Rows with `arrival_date IS NULL` are forced into **Waiting** with subtitle "Awaiting arrival" regardless of stage values, because PRD §7.2 mandates that all stages stay `Waiting` until arrival; the per-stage enum carries no information for these rows.

This rule drives `T-086` (mobile pipeline replacement) and a new desktop "Triage" tab alongside the existing kanban.

**Why:** the kanban-only model breaks on mobile (no horizontal space for 10 stage columns) and overcounts complexity for staff who just want to know "what do I need to do today?". A flat Action/Waiting/Done list answers that directly. Spot-checked against `TRACKER -- KDL.xlsx` (508 historical rows, 2025–2026):
- 86% of rows fully released → Done bucket dominates archive views.
- Of the 69 active rows: `Action`=30%, `Waiting`=35%, `paid`/`closed` (lowercase typos)=31%, `PREPARED`=3%. The `Action` enum is genuinely used by operators, so the classifier has a real signal — not just a hypothetical one.

**Why fold `PREPARED`/`SHARED`/`CARRY IN END`/`W/CARRY IN` into Action Needed:** these are intermediate non-terminal values that mean "work has started, someone owns this." Putting them in Waiting would hide active work; putting them in their own "In Progress" bucket would clutter the UI for the ~3% of rows in this state. Bucket-with-Action keeps the view to three sections.

**Why `updated_at`, not per-stage `stage_changed_at`:** PRD §6.2 says "Stage timestamps are recorded automatically when a stage is marked complete" — but the current schema only writes `updated_at` on every row UPDATE. Adding per-stage timestamps is a separate, larger change (schema migration + trigger work) and not required to launch the triage view. `updated_at` is a coarser approximation but works: any stage transition bumps it, so a row that's been at the same active stage for 48h+ has by definition not been touched in that time. We can swap in `stage_changed_at` later without changing the bucket rule.

**Why not use `current_status` as a row subtitle:** spot-check showed 504/508 rows say `"CARRY IN END"` (it echoes the Shipping Batch state, not a triage hint). The subtitle will instead be the active stage's human label (e.g. "Duty payment", "TBS Debit") — already available in `PIPELINE_STAGES[].label`.

**Casing bug hypothesis — invalidated:** during the spot-check we observed `"paid"`/`"closed"` (lowercase) in 22 rows of the source xlsx, which would have miscategorised those rows as not-done. Investigation showed this is **only present in the operator's Excel source file**, not in the live DB:
1. `parseTracker.coerceEnum` (`src/server/import/parse-tracker.ts:660`) already does case-insensitive whitespace-tolerant matching, so `"paid"` → `"Paid"` on import.
2. The Postgres enum columns reject any non-canonical value, so no other write path (form submission, `advance_stage()`, direct SQL) can produce lowercased data.

No data migration is needed. The xlsx itself is the operator's working copy and will be retired once the app launches. Leaving this paragraph here so a future reader looking at the xlsx doesn't repeat the investigation.

**Alternative considered:** keep the kanban as the only stage view and add a separate "stuck jobs" filter. Rejected — doesn't solve the mobile problem (kanban itself is the mobile problem) and doesn't address the broader "what do I do next?" question for operators with 30+ active jobs.

---

<!-- Append new decisions below this line. Number sequentially. -->

## D-046 — Per-column UPDATE enforcement on `consignments` via BEFORE UPDATE trigger + tx-local GUC bypass

**Context (T-081 security review).** The `consignments_update` RLS policy (migration `20260519005000`) ends in `with check (true)`. Its `using` clause correctly gates UPDATE to admin/operator roles, but once past that gate an operator could PATCH **any** column via PostgREST — including `amount` and `client_id` — even though their role's `role_column_permissions.can_write` is `false` for those columns. The per-column rule was enforced only in the app layer (`src/server/actions/edit-consignment.ts:47`), which protects the UI path but not a direct REST call. This violated CLAUDE.md §3.3 ("per-column permissions enforced two ways: RLS policies on UPDATE *and* UI"). It was the last open compromise before deploy and a hard blocker on T-081.

**Decision.** Enforce per-column writes at the DB with a `BEFORE UPDATE` row trigger (`consignments_enforce_column_write()`), migration `20260525090000_consignments_column_write_guard.sql`. For each column that actually changed (`to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k`), it calls the existing `public.can_user_write('consignments', k)` and `raise exception ... errcode '42501'` on the first forbidden change. Admins short-circuit via `is_admin()`. `updated_at` is exempt (bumped by `set_updated_at()` on every update).

**Why a trigger, not RLS.** RLS `with check` is a row predicate; it cannot compare OLD vs NEW per column. "Did this column change, and may the caller change it" needs OLD/NEW, which only a `BEFORE UPDATE` row trigger provides. The codebase already establishes this exact pattern (`roles_prevent_system_mutation()`, migration `20260518175820`).

**Why a tx-local GUC bypass, not column GRANTs or owner-detection.** `advance_stage()` / `force_set_stage()` are SECURITY DEFINER but a BEFORE UPDATE trigger still sees the real caller's `auth.uid()`. They write `updated_by` (NOT in the operator writable seed), so a naive guard would `42501` the one sanctioned pipeline writer. The two functions opt out via `perform set_config('app.bypass_column_guard', 'on', true)` placed right after their caller-role/admin gate; the guard early-returns when the flag is set. `is_local = true` ⇒ the flag resets at transaction end ⇒ safe on PgBouncer/pooled connections. Rejected alternatives: (a) detecting the function owner via `current_user`/`session_user` is deploy-fragile in Supabase (table + functions share an owner); (b) a static column allowlist (`updated_by`/`release_date`) would leave those columns unguarded on the *direct* REST path too — the GUC approach keeps them guarded there.

**Trade-offs.** New columns fail closed: any column an operator should write needs a `role_column_permissions` seed row, else the guard blocks it (intended — explicit over implicit). Soft-delete is unaffected because it is admin-only (`softDeleteConsignmentAction` checks `perms.isAdmin`) and admins bypass the guard.

**Folded-in fix.** The original operator/viewer seed (`20260518175820`, lines 156 & 194) and the roles-matrix UI (`roles-client.tsx`) named a non-existent column `in_ref_batch_id`; the real column is `in_ref`. The same migration deletes the dangling perm rows and upserts the correct `in_ref` rows (operator writable, viewer read-only); the UI string was corrected too. Without this, operators silently couldn't write `in_ref` and the new guard would have blocked it.

**Scope.** `consignments` only. `efd_records` has the identical `with check (true)` gap but no per-column seed today — logged as a follow-up task rather than widened into T-081.

---

## D-047 — Excel parser handles the real source-file structure (supersedes parts of D-036)

**Context.** Importing the live `TRACKER -- KDL.xlsx` (the file the app replaces) produced **545 errors, 0 parsed rows**, all "Data row before any year separator or header row." `parseTracker` (`src/server/import/parse-tracker.ts`) was coded against the idealized structure in D-036, but byte-level inspection of the real workbook (sheet `IMPORT`, 562 rows, 2 year sections) showed D-036's structural assumptions don't match the actual file. PRD §9.3 says the importer "must handle the source file's structure" and the source file is the authoritative artifact, so the parser changes to fit it.

**What the real file actually looks like:**

1. **Year separator is a merged banner, not a single cell.** The year is repeated across the row's columns (row 2 = `2025` ×21 cells; row 277 = `2026` ×20 cells), backed by cell merges. D-036 §2 ("a single non-empty cell whose value parses as a 4-digit year, all other cells empty") is wrong for this file.
2. **Header precedes the first year banner.** Order is: title-junk row → header row → `2025` banner → data → `2026` banner → data. D-036 §2's "next non-empty row after a year separator is the header" is inverted here.
3. **One header for the whole file.** The `2026` section has no header of its own; the single header must stay active across year banners.
4. **The container-type column has no header.** Its header cell is merged into "No. of Cont(s)" (merge `c5–c6` on the header row), so SheetJS leaves the container-type column (holding CAR/40FT/COIL/20FT) unlabeled. Header-only matching can never resolve it.
5. **Header labels carry typos:** `CURENT STATUS`, `TANESWS Loadging`, `TBS Loadging`, `Inspectione file`, `B/L No;`, and `"No. of\r\nCont(s)"` (embedded CRLF).

**Decision.**

1. **Year-row detection** = a row where *every* non-empty cell coerces to the **same** 4-digit year in 2000–2100. (A single-cell year row trivially satisfies this, so D-036's synthetic test inputs still pass.)
2. **Header is discovered by scanning every non-blank row** (the title-junk row fails the `≥5 hits` + required-fields heuristic; the real header passes) and is **sticky**: once found it stays active. A year banner only flips the active year — it never clears the header map. This drops D-036's "header re-required per section" behavior.
3. **Header order is free.** A header may appear before any year banner; data rows are only parsed once both a header and an active year exist. A data row seen with a header but no active year is still an error (preserved from D-036); unrecognized rows seen *before* the header (preamble/junk) are counted as `skipped`, not errors, so a title row doesn't produce a spurious per-row error.
4. **Container-type column resolves by strict positional fallback.** If no header maps to `container_type` but `container_count` did, the column immediately to the right of the count column is used. If that column holds non-enum values, those rows error individually via the existing per-row container-type guard — no silent mis-mapping.

**Unchanged from D-036:** two-bucket output (errors block, warnings inform), header-driven column resolution as the primary mechanism, the `{rowIndex, refNo?, field?, message}` issue shape, and skipped-row accounting. D-035 (parser is pure over `CellValue[][]`, SheetJS in adapters) is untouched — all detection runs on the cell matrix; cell-merge facts are read off the *data* shape (repeated year values), not the SheetJS `!merges` table, keeping the parser library-agnostic.

**Trade-offs.** Year detection is marginally looser (a genuine data row that happened to contain only one identical year value in every populated cell would be read as a banner) — acceptable: real data rows always carry a ref_no/text alongside, so they never satisfy "all cells the same year." The container-type fallback assumes count-then-type column adjacency, which holds in the source file and degrades safely (per-row error) if a future file differs.

---

## D-048 — Kanban board uses themed slim scrollbars + horizontal-scroll affordance

**Context.** The Pipeline Board relied on raw native OS scrollbars (no custom scrollbar CSS existed anywhere). On Windows 11 this rendered chunky light-grey vertical bars inside every column's card list that clashed with the dark app shell, and the board's horizontal scroller gave no signal that more columns existed off-screen — so sideways navigation felt unintuitive. User-reported polish, not a PRD item.

**Decision.** Presentational only:
1. Two scrollbar utilities in `globals.css` (`@layer utilities`): `.scrollbar-thin` (slim, theme-token-colored thumb via `::-webkit-scrollbar` + Firefox `scrollbar-width/color`) and `.scrollbar-auto-hide` (thumb transparent until container hover/focus-within). Column card lists use both (auto-hiding vertical); the board's horizontal scroller uses `.scrollbar-thin` (always-slim).
2. `kanban-column.tsx`: column header is now `sticky top-0` with a translucent backdrop so the stage label persists while scrolling; card list gains `overscroll-contain` so a column's scroll doesn't bubble to the board's horizontal scroller at its ends; empty columns render a dashed "Drop here" placeholder instead of plain "Empty" text.
3. `kanban-board.tsx`: the scroll viewport is wrapped in a `relative` container with two `pointer-events-none` left/right gradient fades (from `--background`) that frame the board and hint at off-screen columns; an `onWheel` handler maps a vertical wheel to horizontal board `scrollLeft`.

**Wheel behavior (refined after first pass).** The initial handler hijacked *every* vertical wheel for horizontal scroll, which broke scrolling cards within a tall column. Final rule: a plain wheel is redirected to horizontal **only** when (a) `Shift` is held (the web convention — `Ctrl` was rejected because it collides with browser zoom), or (b) the column card-list under the cursor can't scroll further in the wheel's direction. The handler locates that card-list via a `data-kanban-scroll` attribute on the column scroller (`kanban-column.tsx`) and checks `scrollTop`/`scrollHeight`/`clientHeight`. Horizontal trackpad gestures (`|deltaX| > |deltaY|`) are left to the browser.

**Scope / non-goals.** No changes to drag-and-drop, `advance_stage`, the card layout itself, or any data flow. Edge fades are always rendered (no scroll-position listener) — simplest robust version; making them appear/disappear at the true ends was deferred as unnecessary. Firefox can't transition the auto-hide thumb and falls back to the always-slim bar (acceptable).

---

## D-049 — Explicit "Mark Released" affordance on the board + celebration

**Context.** On the desktop Pipeline Board the **Release** column is the last column. The board's forward-drag model means "I'm done with the current active stage," but a card already sitting in Release has `active_stage = "release_status"` at value `Waiting` and there is no column to its right to drag toward; `handleDragEnd` also ignores same-column drops. So cards flooded into Release with **no UI to mark them `Released`** — even though `advanceStageAction(release_status, "Released")` already exists and `fetchKanbanData` already filters released rows off the board (`.neq("release_status","Released")`). Staff also wanted releasing a consignment to *feel* like the milestone it is. User-reported UX gap, not a PRD item.

**Decision.** UI-only, additive — no migration, no schema change, no new server action.

1. **Two trigger affordances** for marking a Release-column card `Released`, both routing through one shared `releaseConsignment(card)` handler in `kanban-board.tsx`:
   - **Per-card button** (`kanban-card.tsx`): a primary `✓ Mark Released` button rendered only when `card.active_stage === "release_status"` **and** the user `canDrag` (admin/operator). The button stops pointer/click propagation and does not carry the dnd drag listeners, so clicking it never starts a drag. It calls an `onRelease(card)` callback threaded board → `kanban-column.tsx` → card; the card never calls the server action itself (board stays the single orchestrator).
   - **Drag-to-release zone** (`kanban-board.tsx`): a slim `useDroppable({ id: "__release__" })` target to the right of the Release column, highlighted on `isOver`. `handleDragEnd` special-cases `toField === "__release__"`: valid only when the dragged card's `active_stage === "release_status"` (already in Release); otherwise a friendly info message ("move it to Release first"), no release.

2. **Shared release routine** reuses the existing optimistic-removal path (`applyOptimistic({ card, landingStage: "release_status", removed: true })` — the same mechanism the `fullyReleased` drag path already uses), calls `advanceStageAction` with `stage="release_status"`, `newValue="Released"`, reverts on error via `setError`, and on success fires the celebration.

3. **Celebration = confetti + the board's existing `info` banner** (`🎉 <ref> released!`). The info/error banners are this codebase's established "toast" pattern (mirrors `settings/users/users-client.tsx`; consistent with the toast decision noted earlier in this file) — **no toast library is added**. Confetti uses the new **`canvas-confetti`** dependency (`@types/canvas-confetti` dev), `import()`-ed lazily inside the success handler so it stays out of the initial chunk and never touches SSR (the board is already `dynamic(ssr:false)`).

**Permissions.** Gated by the same `canDrag = isAdmin || roles.includes("operator")` as every other advance; the DB `advance_stage()` re-checks caller role (D-029) and PRD §7.1 prerequisites, so no new server guard is needed.

**Scope / non-goals.** Desktop board only — the gap the user described. Mobile/triage release is unaffected because `stage-action-menu.tsx` already exposes "Mark Release Released" for the active stage. No change to drag semantics for stages 1–9, to `advance_stage`, or to any data flow beyond the new release trigger.

---

## D-050 — Reference-data management in Settings (Clients, ICDs, Vessels) + vessel autocomplete

**Date:** 2026-06-03
**Status:** Active

**Context.** New-consignment entry repeats a fixed set of values — client, ICD, vessel. `clients` and `icds` were already proper reference tables (seeded PRD §13; soft-delete, `is_active`, audit triggers, RLS = everyone reads / admins write) but had **no management UI**: new entries only appeared via the Excel import auto-create path (D-037) or a hand-written migration. `vessel_name` on `consignments` is free text (typo-prone) even though the same vessel recurs across many rows (the GUTA auto-pair trigger keys on it).

**Decision.**

1. **New `vessels` reference table** (migration `20260603090000_vessels.sql`), shaped exactly like `icds`: `id, name, is_active, deleted_at, created_at, updated_at`; unique index on `name where deleted_at is null`; `set_updated_at` + `log_table_change` triggers; RLS copied from `icds` (authenticated SELECT, admin-only write). Seeded by backfilling `select distinct trim(vessel_name) from consignments`. `vessel_name` on `consignments` **stays free text** — the table is a suggestion source, not a FK.
2. **Three admin-only management screens** under the existing `/settings` area (`/settings/{clients,icds,vessels}`), gated by `settings/layout.tsx`'s existing `isAdmin` redirect. One shared configurable client component (`settings/reference-manager.tsx`) drives all three — the entities differ only in declarative field config + which server actions they call, so a single parameterised component beats three near-identical copies (the variation is data, not behaviour). New server actions in `src/server/actions/settings-reference.ts`.
3. **"Remove" = an `is_active` toggle, not deletion** (user decision 2026-06-03). Inactive rows stay listed in Settings but are excluded from the consignment-form dropdowns/datalist (`.eq("is_active", true)`). Nothing is hard- or soft-deleted from these screens; `deleted_at` remains on the tables (schema/audit consistency, D-015) but is never set here. Fully reversible.
4. **Vessel autocomplete:** the `vessel_name` input on the New + Edit consignment forms gains `list="vessel-options"` + a `<datalist>` populated from active vessels. Suggests known names, still accepts free text — no enum, no required match. This is the "Both" choice (managed list **and** free-text fallback).
5. **Folded-in fix:** the client dropdowns on both forms now render `name — sub_label` (and fetch `sub_label`). The seed has 5× `PAPA` and 8× `JOYCE` variants distinguished only by `sub_label`, which were previously indistinguishable in the picker.

**Why user-bound client, not admin client.** The new server actions use `getSupabaseServerClient()` (user JWT) for both reads and writes. Admin RLS on all three tables already permits the write, so routing through the user client keeps the D-026 admin-client allowlist at exactly 3 sites and keeps writes RLS-governed. `requireAdmin()` runs first as defense-in-depth + for friendly error messages.

**Access model.** Admin-only, matching the existing `clients`/`icds` RLS (admins write / everyone reads). Operators who need a new client/ICD/vessel either ask an admin or rely on the Excel-import auto-create path (D-037), which is unchanged. Widening write access to operators would require RLS changes and was explicitly deferred.

**Trade-offs.** A duplicate near-name (e.g. `MSC ANNA` vs `MSC ANNA.`) can still be added as a distinct vessel — acceptable; the datalist surfaces existing names to discourage it, and admins can deactivate duplicates. The vessel table can drift from `consignments.vessel_name` over time (free text means a typo'd consignment vessel won't auto-appear unless re-seeded) — acceptable for a suggestion list; the day-one backfill covers history.

**Verification surface:** V-REFDATA in `validation.md`.

## D-051 — Default theme is light; theme class applied to `<html>` pre-paint

**Context.** The app previously defaulted to dark and toggled a `dark` class on a `<div>` *inside* the client-only `AppShell`. Server HTML shipped with no theme class, so every page load painted with the light `:root` palette for one frame before React hydrated and added `dark` — a visible flicker on navigation. PRD doesn't specify a default theme, so this is a decision.

**Decision.**
1. **Default theme = light.** `readThemeSync()` returns `"light"` unless `localStorage["kdl-theme"] === "dark"`.
2. **Theme class lives on `<html>`**, set by a synchronous inline `<script>` in `src/app/layout.tsx` that runs before first paint (standard no-flash pattern). React state (`app-shell.tsx`) only drives the toggle icon + persistence and calls `applyTheme()` to keep `<html>` in sync on user toggles.
3. **Login/auth pages follow the saved theme** (default light) rather than being locked to light — the class is on `<html>`, above the route groups.

**Trade-off.** The localStorage key `"kdl-theme"` is duplicated as a string literal in the inline script (it can't import `THEME_KEY` — it runs pre-hydration). Coupling noted in comments in both files.

## D-052 — Client View (PRD §8.4): top-level nav, admin-gated revenue, year-scoped

**Context.** PRD §8.4 specifies a "Client View" (all consignments for a client, total containers / total revenue / avg clearance time, active vs completed) that had not been built. Clients existed only as a Settings reference table. The specifics of *where* it lives, *how* revenue is gated, and *year scope* are not in the PRD, so they are decisions.

**Decision.**
1. **Placement = top-level `Clients` nav (master-detail) + clickable client names everywhere.** New route `/clients` (list, all roles via RLS) and `/clients/[id]` (deep-linkable detail). Client names in the consignments list (`consignments-client.tsx`) and consignment detail header (`consignment-detail.tsx`) now link to `/clients/[id]`. Nav item has no `roles` restriction (visible to admin/operator/viewer like Dashboard/Consignments).
2. **Revenue stat is admin-only.** `total revenue` is computed and included in the page payload **only when `getServerPermissions().isAdmin`** — non-admins never receive the number (server-side omission, not just UI hiding). Note: this is stricter than the rest of the app today, where `amount` is shown to all in the consignment grid/detail; app-wide `amount` gating is deferred as a separate task.
3. **Year-scoped, default current year.** Stats + job lists are for a selected year (selector in the detail header, default `new Date().getFullYear()`), matching the year-centric consignments list and dashboard.
4. **Stats computed from fetched rows, not `v_client_volume`.** "Active" = any consignment whose `release_status` ≠ `Released` (matching the consignments-list semantics); the view's `active_count` only counts `Waiting` and would disagree with the displayed list. Avg clearance = mean of `release_date − arrival_date` over completed rows with both dates.

**Reuse.** `+ New client` (admin-only button) reuses `createClientAction` (`settings-reference.ts`) — no second creation path. UI mirrors `settings/roles/roles-client.tsx` (left list + right detail + modal). `createClientAction` revalidates `/settings/clients`, so the view calls `router.refresh()` after a create.

**Partial rendering (final: query-param, single route).** Selecting a client must **not** blank/re-render the list. A `/clients/[id]` **segment** route was tried and rejected: the `async` `clients/layout.tsx` re-rendered and *suspended* on each segment change, and the nearest loading boundary (`(app)/loading.tsx`) painted its skeleton over the whole list (visible "list blanks → spinner → list" flicker). A child `loading.tsx` can't fix this because the layout's own `await` suspends *above* it.

Final design — **single `/clients` route, selection driven by `?c=<id>`** (the same query-param pattern the consignments batch panel uses via `?batch=`): `clients/page.tsx` (server) reads `searchParams.{c,year}`, fetches the list **and** the selected client's detail, renders both. `clients-list-panel.tsx` (client) highlights via `useSearchParams().get("c")` and selects via `router.push(/clients?c=…, { scroll:false })`; `client-detail.tsx` year selector pushes `?c=…&year=…` with `scroll:false`. Because the route **segment never changes**, the loading boundary doesn't fire and the client-component list panel (its search text / scroll state) stays mounted across selection — no flicker. Deep-links from the consignments list + detail point at `/clients?c=<id>`. No `[id]` segment, no `layout.tsx`, no `loading.tsx` for this route.

**Trade-off.** Revenue gating here diverges from the (currently ungated) consignment grid until that's addressed app-wide. The year selector offers a fixed window (current year + 5 prior); older years aren't reachable from the UI without a manual `?year=` — acceptable for a 400-consignments/year operation.

## D-053 — Client CRUD consolidated into the `/clients` left panel; Settings → Clients removed

**Date:** 2026-06-09
**Status:** Active — amends D-050 (reference-data management) and D-052 (Client View).

**Context.** Clients were managed in two places: the admin reference screen `/settings/clients` (a `ReferenceManager` with add/edit/activate-deactivate) and the `/clients` left panel (browse + an "Add" modal that already reused `createClientAction`). Two creation paths and a separate settings screen for the same entity is redundant now that `/clients` is a first-class master-detail view (D-052). Per-user request, client management consolidates into the `/clients` left panel.

**Decision.**
1. **Single home = the `/clients` left panel.** The left panel (`clients-list-panel.tsx`) is now the full CRUD surface: search, add, and an **admin-only per-row `⋯` actions menu** with Edit and Delete. The Settings → Clients subsection (`/settings/clients` route + nav entry) is **removed**. `ReferenceManager` stays for ICDs and vessels.
2. **Delete = guarded soft delete.** `deleteClientAction` (admin-only) sets `deleted_at = now()` per D-015, **but only when the client has zero non-deleted consignments**. If any consignment references the client, the action refuses with "This client has N consignment(s) and cannot be deleted." This protects referential integrity in the absence of a hard FK-cascade story and keeps deletion a deliberate, reversible act. No activate/deactivate control is carried over to the panel — delete replaces it for the `/clients` surface (`setClientActiveAction` is left in place, now unused by the UI).
3. **Revalidation retargets to `/clients`.** `createClientAction` / `updateClientAction` / `deleteClientAction` revalidate `/clients` (the surviving surface) rather than the removed `/settings/clients`.

**Reuse.** `deleteClientAction` mirrors the soft-delete shape of `softDeleteConsignmentAction` (`consignment-actions.ts`). Create/edit reuse the existing client actions and the panel's `ModalField` + `useTransition` error pattern.

**Trade-off.** Blocking delete on linked consignments means an admin must first reassign/clear a client's consignments before deleting — accepted as the safer default over orphaning `client_id` references or cascading.

