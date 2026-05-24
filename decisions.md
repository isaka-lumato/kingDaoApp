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

<!-- Append new decisions below this line. Number sequentially. -->
