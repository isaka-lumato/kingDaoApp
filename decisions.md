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


## D-054 — New-consignment required fields + human-readable validation

**Date:** 2026-06-10
**Status:** Active.

**Context.** The new-consignment form surfaced developer-facing validation: zod `path.join(".")` strings and raw Postgres errors (e.g. `null value in column "container_count" violates not-null constraint`). Per-user request, validation must be human-readable, required fields must block blank submits, and duplicate B/L numbers must be reported clearly. The set of required fields beyond DB-enforced ones is not in the PRD, so it is a decision.

**Decision.**
1. **Required fields = Client, Year, Container type, Vessel name.** Client/Year/Container type are NOT NULL in the DB; Vessel name is a product choice (voyages group by `vessel_name + arrival_date`, PRD §8.2/§8.3, so a name is operationally needed). All enforced both in the form (`required`) and in the zod schema with plain-English messages.
2. **Arrival date stays OPTIONAL** — per PRD §8.1, `arrival_date IS NULL` is the meaningful "vessel not yet docked" state; consignments are routinely created before arrival. Not made required.
3. **B/L number stays OPTIONAL but unique-when-present.** PRD §8.2 says B/L is nullable (cars/RoRo) but unique per year. The action pre-checks for an existing non-deleted consignment with the same `bl_number + year` and returns a field-level error ("A consignment with this B/L number already exists for <year>.") before insert, in addition to the existing unique index as the DB backstop.
4. **Errors render per-field, not as one banner.** The action returns `{ error, fieldErrors }`; the form shows each message under its input. Raw DB errors are translated via `friendlyConsignmentDbError()` (`src/lib/db-errors.ts`), shared by create + edit actions.

**Trade-off.** Requiring vessel name means a consignment can't be logged before the vessel is known; accepted per user. The B/L pre-check is a non-atomic read-then-insert (a race could still let the unique index catch a duplicate), which is why the index remains the source of truth and its violation is translated too.

---

## D-055 — Folder-based file system per consignment (evolves the flat attachments feature)

**Date:** 2026-06-22
**Status:** Active. Builds on the original attachments feature (private bucket `consignment-attachments`, signed-URL downloads, RLS, soft-delete, audit triggers).

**Context.** The original attachments feature stored a flat list of files per consignment (images + PDF only). Per user request, staff want a "well-organised file system" — folders and subfolders, free-form, into which they can drop PDFs, Word docs, images, text files, and (since the whole product replaces an Excel tracker) spreadsheets. None of this is in the PRD, so it is a decision. Note: the original attachments migration's header comment cites "T-089 / D-054", but D-054 is actually the new-consignment-fields decision and no T-089 existed in `tasks.md` — that feature shipped without a logged decision. This entry is the canonical record going forward, and the folder work is tracked as T-089.

**Decision.**

1. **Free-form folder tree, modeled as a table — not a Storage path string.** New table `consignment_folders (id, consignment_id, parent_folder_id self-ref nullable, name, uploaded_by, created_at, updated_at, deleted_at)`. `parent_folder_id IS NULL` = a top-level folder of that consignment. Arbitrary nesting allowed. Chosen over a `folder_path text` column because free-form nesting makes rename (one-row update vs. multi-row path rewrite) and empty-folder creation trivial, and the table gets RLS + audit + soft-delete like every other table (principles #2/#4/#5). Cost: one recursive/iterative query to build the tree — negligible at ~400 consignments/yr.

2. **`attachments` gains a nullable `folder_id` → `consignment_folders(id)`.** `NULL` = the consignment's root. Existing rows stay valid with no backfill. The Storage object key stays flat (`consignments/<consignmentId>/<uuid>-<filename>`) — the tree lives entirely in the DB; Storage "folders" are just key prefixes and provide no audit/permission/realtime value.

3. **Permissions mirror the existing attachments model (user's choice).** Folder + file create/upload = operator or admin; soft-delete + rename + move = admin only. Same RLS posture as the `attachments` table and `storage.objects` policies already in place. No new role machinery (principle #8).

4. **Deleting a folder soft-deletes its entire subtree** (descendant folders + their attachments) in one server action, recursively. Soft-delete only (principle #5); bytes are best-effort removed from Storage after the rows are marked deleted, same as single-file delete.

5. **Widened file types (user's choice).** Add to the bucket `allowed_mime_types`, the zod enum, and the `<input accept>`: `text/plain` (.txt), `application/msword` (.doc), `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx), `application/vnd.ms-excel` (.xls), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx). 10 MB cap unchanged. Widening the bucket's `allowed_mime_types` is a schema change → done in a migration, never Studio (D-007/D-019).

6. **UI replaces the flat tab in place (user's choice).** The existing Attachments tab becomes a folder browser: breadcrumb + folder grid on top, files below, upload targets the current folder, "New folder" for operator+admin, rename/delete/move for admin. Word and Excel files download via signed URL rather than preview inline — browsers can't render them in a tab; expected behaviour, not a bug.

**Trade-offs.**
- A unique constraint on `(consignment_id, parent_folder_id, name) WHERE deleted_at IS NULL` blocks duplicate sibling folder names; a soft-deleted folder's name is freed for reuse. Accepted.
- `.doc/.docx/.xls/.xlsx` don't preview inline — they download. Accepted; previewing Office formats in-browser would require a converter we don't want.
- MIME types are spoofable client-side, so the bucket's `allowed_mime_types` (checked by Storage against the real upload) remains the un-bypassable guard; the zod enum + server re-check are defense in depth, consistent with the original feature.

---

## D-056 — Consignments list: multi-field search, allowlisted column sort, all-rows XLSX/PDF export

**Date:** 2026-06-23
**Status:** Active. User-requested, not a tracked task.

**Context.** The `/consignments` list — the screen staff live in — only let users search by `ref_no` (a single `ilike`), hard-sorted by `serial_no` asc with no way to reorder, and had no export, even though `/reports` already ships polished XLSX + PDF exports. Per user request: add Excel (and PDF) export of "the data displayed at that moment… sorted as it is", clickable column-header sorting, and "a proper search" across every uniquely-identifying field. None of this is in the PRD, so it is a decision.

**Decision.**

1. **Export scope = all matching rows, not the current page (user's choice).** The list is server-paginated at 50/page; the export re-runs the same filtered/searched/sorted query with **no `.range()`**, so the file contains every row matching the on-screen year + filters + search, in the on-screen sort order. "What's displayed" is interpreted as "the current filtered view", not "the literal 50 visible rows".

2. **Shared query layer.** Filter/sort/search logic is extracted to one module so the page and the export apply byte-identical filtering — only pagination differs. Pure params (sort allowlist, `parseListParams`, search-column list, sanitizer) live in `src/lib/consignments-list.ts` (no `server-only` barrier, so the client grid imports the `SortKey`/`SortDir` types + allowlist); the Supabase-touching builders (`resolvePrereqs`, `buildListQuery`, `CONSIGNMENT_SELECT`) live in `src/server/consignments/list-query.ts`.

3. **Sort = data columns only (user's choice).** An allowlist map (`SORTABLE_COLUMNS`: ref_no, year, serial_no, arrival_date, amount, vessel_name, bl_number, in_ref) gates the `sort` query param → real DB column, preventing arbitrary `.order()` injection. **Client (a joined table) and Pipeline Stage (a computed value) are intentionally not sortable** — sorting them server-side would need a name-join order / a computed stage-rank expression not worth the complexity. Headers click to sort asc; clicking the active column flips direction; a stable `.order("id")` tiebreaker keeps pagination deterministic.

4. **Search = multi-field, including client name.** Free-text `q` builds a PostgREST `.or()` across `ref_no, tansad_no, bl_number, in_ref, vessel_name, goods_description`. Because client is a foreign table, client-name search is folded in via a **pre-query**: `resolvePrereqs` looks up `clients` whose `name ilike %q%` and adds `client_id.in.(…)` to the `.or()`. The pre-query runs inside the page's existing tier-1 `Promise.all` (D-042), so it adds no round-trip. `q` is sanitized (strip `,()*"\`) before interpolation into the filter string.

5. **Exports reuse the reports builder pattern (T-071/T-072).** New `build-consignments-xlsx.ts` and `build-consignments-pdf.tsx` mirror `src/server/reports/build-{xlsx,pdf}` (title/meta banner, frozen bold header, money `numFmt`, real Date cells, TOTAL row, A4-landscape logo header). A single `export-columns.ts` is the shared column spec. New route `src/app/api/consignments/export/[format]/route.ts` mirrors the reports routes (`runtime=nodejs`, `getServerPermissions()` 401 gate — viewers+ may export, D-026 user-bound client, `attachment` download). `currentStageLabel` moved from the client component into `src/lib/pipeline.ts` so the "Pipeline Stage" column reads identically on screen and in exports.

**Trade-offs.**
- **PDF carries a trimmed column subset** (Ref No, Client, B/L, In Ref, Vessel, Arrival, Pipeline Stage, Amount). The list has 14 export columns; A4 landscape can't hold all legibly. XLSX carries the full set for anyone who needs everything. Accepted.
- **Client-name search is a two-step (prequery → `in`)**, not a single SQL join. Cheap at this scale (~hundreds of clients) and keeps the main query a plain PostgREST builder. Accepted.
- Export auth matches `/reports`: any signed-in role may export the rows their RLS already lets them read. Revenue/amount is part of the consignments grid the user already sees, so no extra admin gate was added.

---

## D-057 — Client model expansion: six-field CRUD (rename sub_label → display_name, add company + phone)

**Date:** 2026-06-27
**Status:** Active. User-requested, not a tracked task. **Supersedes the PRD §5.4 client field list** (`name`, `sub_label`, `contact_email`, `notes`).

**Context.** The client CRUD captured only Name, a "Variant" (`sub_label`, e.g. `PAPA — SAAJT`), Email, and a free-text note. The user asked the client form to capture six fields: **Name, Company, Displayed Name, Email, Phone Number, Remark.** PRD §5.4 is frozen, so this is logged here.

**Decision.** Field → column mapping:

| UI label       | Column          | Change                            |
|----------------|-----------------|-----------------------------------|
| Name           | `name`          | unchanged, the **only** required field |
| Company        | `company`       | **new** nullable text             |
| Displayed Name | `display_name`  | **rename** of `sub_label` (data preserved) |
| Email          | `contact_email` | unchanged, nullable               |
| Phone Number   | `phone`         | **new** nullable text             |
| Remark         | `notes`         | unchanged, nullable               |

1. **Displayed Name replaces Variant entirely (user's choice).** `sub_label` is renamed to `display_name` rather than kept alongside a new field — there is one label concept, not two. It becomes "the name shown everywhere".
2. **Label helper changes from `name — sub_label` to `display_name?.trim() || name`.** Where a Displayed Name is set it is shown verbatim (no `name — ` prefix); otherwise the row falls back to `name`. Applied in the clients list/panel, both consignment-form dropdowns, the dashboard top-clients widget, and the Client Volume + Turnaround reports. Existing seeded clients (no `display_name`) keep showing their `name`.
3. **Only Name required (user's choice).** Company / Displayed Name / Email / Phone / Remark are all optional. Email keeps its `z.email()` validation when present.
4. **Reporting views recreated.** `v_client_volume` and `v_turnaround_by_client` selected `cl.sub_label`; both are recreated to select `cl.display_name`. The view output column (and the report XLSX/PDF header) is renamed `sub_label` → `display_name` ("Displayed Name").

**Trade-offs.**
- The `clients_name_active_uq` unique index spans `(name, coalesce(display_name, ''))`; after the rename the constraint is identical in behaviour (two same-named clients need distinct Displayed Names). Accepted.
- No RLS/policy changes — `clients` writes already go through admin RLS via the user-bound server client (D-026 allowlist unaffected; the D-046 column-write guard is on `consignments` only).

---

## D-058 - Users have exactly one role

**Date:** 2026-06-28
**Status:** Active, implemented 2026-07-02 (migration `20260702195406_user_roles_single_role.sql`). Supersedes the original `user_roles` many-to-many intent from D-004 / migration `20260518175820`.

**Implementation note (2026-07-02).** The decision was logged 2026-06-28 but the code still allowed multiple roles until now. Shipped in this pass: (a) DB `unique (user_id)` constraint `user_roles_one_per_user` with backfill-collapse (no dev user had >1 role, so it was a no-op); (b) `updateUserRolesAction` rewritten to single-role replace (delete-then-insert), self-admin can only stay admin; (c) `inviteUserAction`'s existing-user path now replaces the role instead of treating a duplicate as already-assigned; (d) removed `assignRoleAction` (unused, additive) and `removeRoleAction` (would leave a user role-less); (e) Users UI edit modal switched from checkboxes to a required radio, badges are read-only.

**Context.** The initial permission model allowed a user to hold multiple roles through the `user_roles` join table. That made the effective permission set permissive: if any role granted a column permission, the user received it. For a small internal operations team, that is harder for admins to reason about than a single current role per staff member.

**Decision.**
1. **Exactly one role per user.** A staff account has one active role at a time: admin, operator, viewer, or one custom role.
2. **UI uses single selection.** Settings -> Users role editing uses one selected role, not checkboxes.
3. **Server actions replace, not merge.** Editing an existing user's role deletes their old assignment and inserts the selected role. Creating a new user already selects one role.
4. **Database enforces it.** `user_roles` keeps its existing table name and `(user_id, role_id)` primary key for compatibility, but gains a unique constraint on `user_id` so a second role assignment is rejected at the source of truth.
5. **Backfill collapse rule.** If any existing user has multiple roles when the migration runs, keep the highest-precedence assignment: `admin`, then `operator`, then `viewer`, then the oldest custom assignment; delete the rest.

**Trade-off.** This removes role-composition flexibility, but the permission matrix already supports custom roles for special cases. Single-role assignment makes audits, support, and admin mental models simpler.

---

## D-059 - Rename container fields to cargo fields

**Date:** 2026-06-29
**Status:** Active. User-requested, not a tracked task.

**Context.** The tracker clears more than shipping containers: cars, machinery, loose cargo, bulk cargo, and coils all flow through the same consignment pipeline. The old `container_type` / `container_count` labels were too narrow and caused staff-facing wording to be misleading.

**Decision.**
1. Rename the database enum `container_type` to `cargo_type`.
2. Rename `consignments.container_type` to `cargo_type`.
3. Rename `consignments.container_count` to `cargo_count`.
4. Update app code, import/export code, permissions UI, and generated types to use the cargo names.
5. Keep report/view output names such as `total_containers` for now, because those are aggregate report labels and not the operational row field names.

**Trade-off.** Historical migration files and older status text still mention container names, because migrations are append-only and the PRD is frozen. The live schema and app code use cargo names.

---

## D-060 - Cargo-type expansion and EFD receipt number

**Date:** 2026-06-29
**Status:** Active. User-requested, not a tracked task.

**Context.** Alongside the cargo rename, staff need to classify non-container cargo and capture a lightweight TRA EFD receipt number directly on a consignment.

**Decision.**
1. Add cargo type enum values: `MACHINERY_VEHICLE`, `LOOSE`, and `BULK`.
2. Keep the existing values `40FT`, `20FT`, `CAR`, and `COIL`.
3. Add nullable `consignments.efd_receipt_no text`.
4. Operators may write `efd_receipt_no`; viewers read it only. The migration updates `role_column_permissions` so the DB column-write guard keeps matching live column names.

**Trade-off.** `efd_receipt_no` is a simple per-consignment free-text field and does not replace the richer `efd_records` many-to-many system.

---

## D-061 - ICD & Vessel CRUD promoted to `/icds` and `/vessels` left-panel surfaces; Settings entries removed

**Date:** 2026-06-30
**Status:** Active. User-requested, not a tracked task. Extends D-053 (which did the same for Clients).

**Context.** ICDs and Vessels were managed only inside Settings (`/settings/icds`, `/settings/vessels`) via the generic `ReferenceManager` - a flat add/edit/activate table with no detail view. Clients used to live there too until D-053 promoted them to a first-class `/clients` left-panel master-detail surface. Per user request, ICDs and Vessels get the same treatment: their own left-nav entries, each a table of clickable names that open a per-record detail page.

**Decision.**
1. **Single home per entity = its own left-panel route.** New `/icds` and `/vessels` surfaces mirror `/clients`: a browsable, searchable, sortable table whose name cells link to a detail page (`/icds/[id]`, `/vessels/[id]`). The Settings -> ICDs and Settings -> Vessels subsections (routes + nav entries) are **removed**. `ReferenceManager` and the now-orphaned `settings/reference-manager.tsx` are deleted - nothing uses it after this change.
2. **Nav visibility = everyone; writes = admin-only.** The `/icds` and `/vessels` nav items carry no `roles` gate, so all signed-in users see and browse them (matching `/clients`). Add/Edit/Delete controls render only for admins, and the server actions + RLS already enforce admin-only writes (`requireAdmin()` + `*_write_admin` policies). Read stays open to all authenticated users (existing `*_select_authenticated` policies).
3. **Guarded soft-delete per entity.** New `deleteIcdAction` / `deleteVesselAction` mirror `deleteClientAction` (D-053): admin-only, set `deleted_at = now()`, but refuse when a non-deleted consignment still references the record. ICD reference = `consignments.icd_id`; vessel reference = `consignments.vessel_name = vessels.name` (vessel is matched by free-text name, not an FK - see D-050). The active-toggle controls are retained on these surfaces (unlike the Clients panel, which dropped them).
4. **Detail page = usage view.** Each detail page shows the record's fields plus its consignments (linked to `/consignments/[id]`) and summary stat cards. ICD consignments are found by `icd_id`; vessel consignments by exact `vessel_name`.
5. **No DB change.** The `icds` / `vessels` tables, RLS, audit triggers, soft-delete, and create/update/setActive actions already exist. Only `revalidatePath` targets move from `/settings/icds|vessels` to `/icds|vessels`. `createIcdAction` / `createVesselAction` stay intact - the new-consignment form's inline "Add ICD / Add vessel" modals keep using them.

**Trade-off.** Like D-053, blocking delete on linked consignments means an admin must clear/reassign a record's consignments before deleting - accepted as safer than orphaning `icd_id` / `vessel_name` references. Vessel usage matching is by exact name string (free text), so a renamed-but-not-migrated vessel value on old consignments won't be counted; accepted, consistent with D-050's free-text model.

---

## D-062 - Assessment terminal value renamed Closed → Accepted

**Date:** 2026-07-02
**Status:** Active. User-requested, not a tracked task. Supersedes the `Closed` label from PRD §5 / D-045.

**Context.** The user reviewed the six operator-facing stage statuses against the live enums and found one mismatch: the Assessment stage's "done" value was `Closed`, but staff refer to it as `Accepted` (TRA accepts the assessment). All other stages already matched the desired start/done values; the intermediate `Action` value (and `SHARED` on TBS Debit / Inspection) was explicitly kept. Only this one label changes.

**Decision.**
1. **`ALTER TYPE public.assessment_status RENAME VALUE 'Closed' TO 'Accepted'`** (migration `20260702180410_assessment_accepted.sql`, applied to dev 2026-07-02; guarded idempotent so a replay / fresh rebuild is safe). Rename keeps every existing row valid under the new label — no data migration, no row rewrite.
2. **`advance_stage()` re-emitted** with `Accepted` in the two places it hard-codes the literal: the §8.8 `tbs_loading` prerequisite guard (`assessment_status <> 'Accepted'`) and the §8.1 terminal-state list. It is the only DB object that references the string literal — `force_set_stage()`, the D-046 column-write guard, and the reports view all compare the column dynamically (via `::text` = the stored value) and need no change.
3. **App code updated:** `lib/pipeline.ts` (`STAGE_DONE_VALUE`, `PIPELINE_STAGES` validValues + doneValue), generated `types/supabase.ts` (Enums union + Constants array).
4. **Importer maps legacy `"Closed"` → `"Accepted"` (data-loss guard).** The historical `TRACKER -- KDL.xlsx` source (D-045/D-047) carries `"Closed"`/`"closed"` cells. `parseTracker` now normalises a `"closed"` (case-insensitive) assessment cell to `"Accepted"` before `coerceEnum`, so those rows import at their true stage instead of silently defaulting to `"Waiting"`. Without this, re-importing history after the rename would misclassify every closed assessment.

**Why rename, not add-new-value-and-migrate.** `RENAME VALUE` is atomic, preserves stored data, and needs no `UPDATE ... SET status = 'Accepted' WHERE status = 'Closed'` pass. The only cost is that functions comparing the string literal must be re-emitted — one function (`advance_stage`).

**Trade-off.** The PRD (frozen) and append-only historical migrations still say `Closed`; the live schema, app code, README, doc.md, and validation.md say `Accepted`. The importer alias is the bridge for any historical re-import.

---

## D-063 — TANSAD No fixed format `TZDL-YY-#######`; Ref No auto-generated but editable

**Date:** 2026-07-02
**Status:** Active. User-requested, not a tracked task. Supersedes PRD §8.19's numeric TANSAD model for input/validation; extends D-028.

**Context.** The user asked that the new-consignment form *enforce* two identifier formats: TANSAD No as `TZDL-26-0000000` (literal `TZDL-`, 2-digit year, dash, 7 digits) and Ref No in the `9900001` shape (7 digits). Two findings surfaced while scoping this:

1. **Ref No was generated wrong.** Per D-028 / PRD §8.20 a UI-created `ref_no` should be 7 digits, `99`-prefixed (e.g. `9900001`). The code in `create-consignment.ts` and the duplicate-consignment path in `consignment-actions.ts` instead produced `YY` + 4-digit serial (e.g. `260001`) — a bug against both the PRD and D-028.
2. **TANSAD was free text.** The form validated it only as `max 100 chars`; PRD §8.19 models `tansad_no` as a *numeric* TRA customs number from which a year can be inferred.

**Decision.**
1. **TANSAD No format is strict `TZDL-YY-#######`.** Regex `^TZDL-\d{2}-\d{7}$` enforced in shared zod (`tansadNoSchema`), on the new-consignment server action, and on the edit action. The input is trimmed and upper-cased before validation. This is a deliberate departure from §8.19: the value is now an internal KDL-assigned string, **not** the TRA numeric declaration number, so the §8.19 "infer year from tansad_no" cross-check no longer applies to UI-entered values. The `year` column remains the authoritative year source (already true per D-060). TANSAD stays **optional** at the DB layer (nullable until TANESWS done, per §8.19 lifecycle) — but *if provided via the form, it must match the format*.
2. **Ref No stays auto-generated (D-028) but is now editable.** The form pre-fills the next assigned `ref_no` (7-digit, `99`-prefixed) in a visible, editable input. If the user leaves it as-is, the server still recomputes the authoritative next value at insert time (guards against a stale pre-fill / race). If the user overrides it, the override must match `^\d{7}$` and is subject to the existing `(ref_no, year)` unique index — a collision returns a field-level error. This keeps D-028's race-safe allocation as the default while honoring the user's request for an override option.
3. **Ref No generation bug fixed** in both `create-consignment.ts` and `consignment-actions.ts` (duplicate path): `ref_no = '99' + serial.padStart(5,'0')` → `9900001` for serial 1. The prior `${yearSuffix}${serial.padStart(4,'0')}` is removed.
4. **Shared format constants live in `src/schemas/common.ts`** (`refNoSchema`, `tansadNoSchema`, plus a `TANSAD_PATTERN` / `makeRefNo` helper) so the client input `pattern`/`title` hints and the server zod checks never drift.

**Why enforce client-side too.** UI `pattern` + `title` give immediate feedback and block obvious typos, but the server zod is the real gate (UI guards alone are insufficient — CLAUDE.md §3). Both reference the same regex constant.

**Trade-off.** The PRD (frozen) still describes TANSAD as the TRA numeric number and uses it to infer year. The live app now treats the UI TANSAD field as a formatted internal string. Any historical importer logic that reads a numeric TANSAD is untouched — this decision governs **UI create/edit only**, mirroring how D-028 scoped ref_no generation to UI inserts and left the importer alone. Existing rows with non-conforming TANSAD values are not rewritten; they only fail validation if edited and re-saved through the form.

---

> **Note (2026-07-06 rebase):** D-064…D-069 below were authored on a separate "import logic" branch that used the D-055…D-060 numbers concurrently with the office branch above. They are renumbered D-064+ to avoid collision. Two of them were partially superseded when the branches merged: **D-065/D-066** (list-level TanStack caching + realtime-on-list) were dropped for the office `list-query.ts` sort/search/export list — the TanStack provider + realtime hook survive on the Activity feed and the kanban/triage shell; only the consignments-list caching was reverted. **D-068** (cargo drift) is superseded by the office **D-059**, which performed the same rename via a proper migration. They are kept for history.

## D-064 — Global Activity page (admin audit + usage), access via `audit_log` read permission

**Date:** 2026-06-10
**Status:** Active.

**Context.** The only window into the append-only `audit_log` was the per-consignment audit tab (PRD §8.3). There was no place for an admin to see activity across the whole app or to track usage. Per user request, a top-level **Activity** page is added with two tabs (Changes, Usage), admin-only by default but grantable to other roles. None of this is in the PRD, so it is a decision.

**Decision.**
1. **Top-level `/activity` route + nav item** (not under Settings), placed below Reports. Two tabs: **Changes** (global, filterable `audit_log` feed across all tracked tables) and **Usage** (per-user last sign-in + 30-day action counts).
2. **Access = `isAdmin` OR `canRead('audit_log','read')`.** Reuses the existing per-column permission system with **zero schema change** — `role_column_permissions` accepts arbitrary `(table_name, column_name)` and `getServerPermissions().canRead()` already returns true for admins. A single **Read** toggle on the Roles & Permissions screen, bound to `('audit_log','read')`, grants non-admin roles access. The page and every server action enforce this gate; the nav item is shown under the same condition.
3. **Usage data is derived, not newly captured (v1).** Last sign-in comes from Supabase Auth (`auth.admin.listUsers()`, already surfaced by `listUsersAction`); action counts/last-action are aggregated from `audit_log.actor_id`. **No `login_events` table is built** — Supabase only exposes *last* sign-in, so per-session login history is out of scope for v1 (accepted by user).
4. **Shared formatting.** `renderAuditValue` / `renderColumnLabel` (previously duplicated in two consignment detail files) are extracted to `src/lib/audit-format.ts` and reused by both the per-consignment panel and the global feed, plus a new `renderTableLabel`.

**Trade-off.** `audit_log` RLS stays at its existing authenticated-read (migration 175820) — the **app-layer gate is the real boundary**, consistent with how the per-consignment panel already reads the table. Granting the `audit_log` read permission also exposes the Usage tab (which includes auth `last_sign_in_at`); this is intentional — "see the audit log" and "see who's been active" are treated as one capability for v1. Login data is only ever fetched inside the admin-checked server action, never shipped to unauthorized clients.

## D-065 — Activate TanStack Query for client-side caching (mount QueryClient, seed from RSC)

**Date:** 2026-06-11
**Status:** Active.

**Context.** `@tanstack/react-query` is in the locked stack (§2) and `src/lib/query-keys.ts` was fully built out, but the library was **dormant**: no `QueryClientProvider` was mounted and there were zero `useQuery` usages. Every navigation, filter change, pager click, and tab switch re-ran the full RSC → Supabase chain from scratch (the Activity feed re-fetched `listActivityAction`/`listUsageAction` on every interaction; the consignments list re-rendered server-side on every URL change). The server layer is already well-optimized (D-040/D-041/D-042), so the next meaningful speedup is a **client cache**. Prompted by the user asking to make the app faster.

**Decision.**
1. **Mount one `QueryClientProvider`** via a new client component `src/app/providers.tsx`, wrapping the `(app)` route group only (keeps `/login` lean). Client is `useState`-stabilised (one instance per browser tab, fresh per server request — standard App Router pattern). Defaults tuned for an internal low-churn tool: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`.
2. **Seed every cached read from the server's first render** via `initialData` so SSR first paint is unchanged — caching is purely additive; no page becomes client-only or loses its server-rendered first frame.
3. **URL params stay the source of truth** for the consignments list. The query *key* is derived from the URL (year/page/filters); the cache just makes revisited combos instant. `placeholderData: keepPreviousData` preserves the D-043 "old rows stay visible while loading" feel.
4. **Rollout order:** Activity feed first (lowest risk — already client-fetched), then the consignments list (extract `listConsignmentsAction` as the shared `queryFn`). Mutations invalidate `queryKeys.*` rather than relying solely on `revalidatePath`.

**Trade-off.** Adds a provider + client cache to a previously RSC-pure data path. Accepted because the keys/infra already existed and `initialData` keeps SSR intact. The alternative (server-only + `revalidatePath`) cannot make back/forward or re-filter instant — which is the felt-latency the user reported.

## D-066 — Supabase Realtime merged into the cache via `setQueryData` (not refetch)

**Date:** 2026-06-11
**Status:** Active. **Depends on D-056.**

**Context.** §3.7 mandates subscribing to `consignments`/`efd_records` via Realtime and merging events with `setQueryData` rather than refetching. Realtime was not enabled on any table, and the kanban refreshed via `revalidatePath("/")` after `advanceStageAction` — which only updates the acting user's view on next navigation and never reflects *other* users' changes live (the multi-user visibility this app exists to provide).

**Decision.**
1. **Enable Realtime** on `public.consignments` and `public.efd_records` via a CLI migration (`alter publication supabase_realtime add table ...`) with `replica identity full` so UPDATE payloads carry old+new rows. No RLS change — Realtime respects existing RLS.
2. **A client hook (`use-consignments-realtime.ts`)** opens one `postgres_changes` channel and patches cached list/kanban queries via `queryClient.setQueryData` on UPDATE; coarse `invalidateQueries` fallback for INSERT/DELETE. Cleanup via `removeChannel` on unmount.
3. **Kanban** keeps its existing `useOptimistic` for the actor's own drag; Realtime covers changes made by *other* users, replacing the `revalidatePath`-driven refresh.

**Trade-off.** `replica identity full` slightly increases WAL volume per update — negligible at ~400 consignments/year. Worth it for live multi-user sync without refetch storms.

## D-067 — Excel import commits in client-driven bulk chunks with a live progress bar

**Date:** 2026-07-04
**Status:** Active.

**Context.** Importing the historical tracker (~5,000 rows) was effectively unusable. The parser (T-060/T-088) is a pure in-memory pass and is not the problem; the commit path (`commitImportAction`) was. It re-parsed the uploaded file server-side and then inserted **one row at a time, sequentially**, awaiting ~4–6 Supabase round-trips per row (client lookup, ICD lookup, consignment insert, then two inserts per EFD code). At Cloud latency that is ~20,000–30,000 serialized round-trips for a 5,000-row file ≈ 15–25 min — far past the Vercel serverless limit, so the request was killed mid-way leaving a **partial, un-rolled-back import** and duplicates on retry. The UI showed only a `"Committing…"` spinner. Prompted by the user reporting the import is not easy and asking for clear progress UI.

**Decision.**
1. **Parse once, on preview.** `previewImportAction` already returns the full `result.consignments` array to the client (the preview table just `.slice(0, 25)`s it). The client keeps it in state — the file is never re-uploaded or re-parsed for commit.
2. **Client-driven chunked commit.** A new `commitChunkAction({ jobId, chunk, isFirst, isLast })` accepts a ~300-row JSON slice (not the file). The client loops the parsed rows in `CHUNK_SIZE = 300` batches, awaiting each call and advancing a real progress bar (`committed / total`, %). Short requests never approach the timeout, and a failed/stopped chunk is resumable.
3. **Bulk inserts inside each chunk.** References resolve in a couple of queries (one SELECT per `clients`/`icds` + one bulk INSERT of missing names → in-memory `upperName → id` map), then consignments bulk-insert in one statement (`.select("id, ref_no, year")`, matched back by the `(ref_no, year)` key), then EFD records and link rows bulk-insert (RETURNING preserves VALUES order, so ids zip back by position). A chunk that was hundreds of round-trips becomes a handful.
4. **Row-by-row fallback preserves error attribution.** A bulk INSERT is atomic, so any error (bad enum, or a duplicate on re-run) means nothing was written for that statement — the chunk retries **row-by-row** to attribute the failure to the exact `ref_no` while the rest of the chunk still imports. Happy path stays fully bulk.
5. **Idempotency via the existing partial unique index** `consignments_ref_no_year_uq (ref_no, year) where deleted_at is null` — re-running the same file rejects duplicates (surfaced per-row through the fallback) instead of double-inserting. No EFD-level dedup (full backfill is one-time).
6. **Audit row folded per-chunk.** `import_jobs.inserted_count` and `payload.failures` accumulate across chunks; the terminal `status`/`committed_at` are stamped on `isLast`, which also fires the `revalidatePath` set.
7. **Body limit.** `next.config.ts` sets `experimental.serverActions.bodySizeLimit = "8mb"`; the preview upload cap in `previewImportAction` is lowered from 25 MB to 8 MB to match (a 5,000-row `.xlsx` is ~1–3 MB).

**Trade-off.** Not a single DB transaction, so an import is not strictly all-or-nothing — a mid-run stop leaves earlier chunks committed. Accepted because the unique index makes re-running safe/resumable and the chunked model is what enables the live progress UI the user asked for. The alternative (one Postgres RPC in a single transaction) is atomic and fast but cannot stream per-row progress back for the bar; chosen against for a one-time historical backfill where visible progress + resumability matter more than atomicity.

## D-068 — Cargo rename + enum changes: DB is authoritative, code follows (drift adopted, migrations owed) — SUPERSEDED by D-059

**Date:** 2026-07-04
**Status:** Active — **partial: code + types aligned, migrations NOT yet written (debt, see below).**

**Context.** Re-import QA after D-058 failed at runtime with `column consignments.container_count does not exist`, then (after the first fix) with `invalid input value for enum assessment_status: "Closed"`. Root cause: the **live dev DB was edited directly in Supabase Studio** (renames + enum changes) and those changes never went through a migration, so `supabase/migrations/`, `src/types/supabase.ts`, and all app code still spoke the old vocabulary. This is a **direct violation of CLAUDE.md §7 / D-007 / D-019** ("never edit schema via Studio for a deployed environment") — the edits were made by the user for a client requirement before the rule's cost was visible. Typecheck/lint/tests all stayed green *because they validate against the types file, not the live DB* — so the drift was invisible until a real insert hit Cloud.

**What actually changed in the live DB (captured by introspecting the PostgREST OpenAPI spec with the secret key, since `supabase gen types` needs a CLI login we don't have in-session):**
1. `consignments.container_count` → **`cargo_count`** (column rename).
2. `consignments.container_type` → **`cargo_type`** (column rename) and the enum type `container_type` → **`cargo_type`**.
3. Enum `cargo_type` gained **`MACHINERY_VEHICLE`, `LOOSE`, `BULK`** (was `40FT | 20FT | CAR | COIL`, now 7 values). Reflects real cargo the client handles that isn't containerised.
4. Enum `assessment_status` terminal value `Closed` → **`Accepted`** (was `Waiting | Action | Closed`, now `Waiting | Action | Accepted`).
5. A new column **`efd_receipt_no`** exists on the live DB (observed during the same introspection; unused by app code today — its adoption is deferred, see D-060 note / follow-up task).

**Decision.** The DB rename is **intentional and authoritative** (client wants "cargo", not "container", and the new cargo/assessment values are real). Code follows the DB, not the reverse. Concretely:
1. **Types hand-patched.** `src/types/supabase.ts` had been truncated to 0 bytes by a failed `gen:types` run — restored from `git HEAD`, then hand-edited to match the live DB (both column keys, the enum type name, the 3 new `cargo_type` values, and `assessment_status` → `Accepted`). Hand-patching (not regenerating) because `supabase gen types --linked` requires an interactive CLI login unavailable in-session; the introspected OpenAPI spec is the same source of truth the generator would use.
2. **`container_* → cargo_*` propagated across ~23 code files** — server actions, forms (new/edit), consignment detail/secondary, dashboard, kanban card, clients page, audit-format labels, roles matrix, both import paths (`import-actions.ts` + `scripts/import-tracker.ts`), and `parse-tracker.ts`. UI labels changed "Container" → "Cargo"; the two form dropdowns + the create-consignment zod enum gained the 3 new values.
3. **The Excel bridge is preserved.** The tracker `.xlsx` still uses container-era headers (`"container type"`, `"no of conts"`) and the legacy assessment label `"Closed"`. `parse-tracker.ts` keeps those header-alias strings and now **translates on import**: header-text → `cargo_*` logical fields, and `assessment_status` cell value `/^closed$/i` → `"Accepted"` (no warning — it's an expected legacy label, not a data error). So historical sheets import unchanged; only the DB-write vocabulary moved. Answers the user's question "can we write logic to accept container* Excel into cargo* columns?" — yes, the mapping lives entirely in the parser.
4. **`isCargoType()` guard + the "unknown cargo_type" error message** updated to the 7-value set. Two new parser unit tests lock the `"Closed" → "Accepted"` translation and native `"Accepted"`.

**DEBT — migrations still owed (does NOT match the live DB until written).** No SQL migration in `supabase/migrations/` reproduces renames #1–#5. This means: (a) a fresh `supabase db reset` / a new environment (incl. **prod**) would rebuild the OLD `container_*` / `Closed` schema and the app would break there exactly as dev did; (b) migration history is now drifted from the live dev DB. Before any prod deploy (T-083) a migration must be authored that does `alter table … rename column`, `alter type … rename`, `alter type … add value` (×3), and the `assessment_status` value change (enum value renames need the `rename value` form or a type-swap), plus adds `efd_receipt_no` properly. Tracked as a new human/задача item — see `humanTasks.md` H-014 and `tasks.md`. **This entry is the record that dev is ahead of the migrations, deliberately, and prod is not yet safe.**

**Why hand-patch now instead of waiting for a proper migration:** the user needed the re-import unblocked immediately and had no Supabase login available in-session. Aligning code+types to the already-live dev schema unblocks the import today; the migration is a separate, non-urgent correctness task for the prod path. The risk (someone deploys to prod before the migration exists) is called out here and in `humanTasks.md` rather than silently carried.

**Verification.** Introspected live enums to confirm exact values (not guessed). Typecheck clean, lint 0 errors / 4 pre-existing warnings, 36/36 parser tests (incl. 2 new), full suite green. Real-fixture re-import against dev still owed (D-058's outstanding item) — the two enum/column errors that blocked it are now fixed.

## D-069 — File storage stays on Supabase for v1; external object store is a non-destructive swap later

**Date:** 2026-07-04
**Status:** Active — decision to **defer**; no code change.

**Context.** User asked whether Supabase Storage will be expensive at scale and — if they later move file storage to an external service (S3/R2/Backblaze/etc.) — whether that migration would be **destructive**. Consignment attachments (T-089, migration `20260609120000_consignment_attachments.sql`) are the only user-uploaded binary today: a **private** bucket `consignment-attachments`, 10 MiB/file cap, images + PDF only, objects keyed `consignments/<consignmentId>/<file>`. The **bytes** live in Storage; the **metadata** (path, filename, mime, size, uploader) lives in the `attachments` Postgres table. Upload is browser-direct-to-Storage (RLS-gated) then a `recordAttachmentAction` metadata insert; download is a 60-second signed URL; delete is soft-delete-row-then-best-effort-object-remove.

**Decision.** Stay on Supabase Storage for v1. Revisit only if storage cost or egress becomes material.

**Why cost is a non-issue at this scale:** ~400 consignments/year, a handful of scanned docs each, ≤10 MiB apiece → low tens of GB/year even pessimistically. Supabase's included storage + egress covers that comfortably on the current plan; an external store would save cents while adding an integration to maintain. Premature (CLAUDE.md §3.8).

**The migration would NOT be destructive — and the codebase is already shaped to make it a clean swap.** This is the substantive answer to the user's question:
1. **The database is untouched by such a move.** Only the *bytes* relocate; the `attachments` table (the source of truth for what exists) stays exactly as is. `storage_path` is already an opaque string — it can name an S3/R2 key just as well as a Supabase object. No row is deleted, no consignment linkage changes.
2. **The swap surface is tiny and centralised** — three call sites, all already isolated behind the `ATTACHMENT_BUCKET` constant and `supabase.storage`:
   - upload: `attachments-tab.tsx` (`.storage.from(BUCKET).upload(...)`),
   - signed download URL: `getAttachmentUrlAction` (`.createSignedUrl`),
   - object delete: `deleteAttachmentAction` (`.storage.remove`).
   Replacing these with an S3-compatible client (presigned PUT, presigned GET, DELETE) is a localised change; the metadata table, RLS model, permission gates, and UI stay put. (Note: **R2/S3 are themselves S3-compatible**, and Supabase Storage also exposes an S3-compatible endpoint — so an adapter interface over "put/get-signed-url/remove" would let both coexist during a cutover.)
3. **Existing files migrate by copy, not cut.** Cutover = copy existing objects to the new bucket (keys can be preserved verbatim, since `storage_path` is reused as the new key), flip the storage client, verify, then delete the old objects afterward. Because download mints a fresh signed URL per request (URLs live 60s, nothing long-lived is persisted), there are **no stored URLs to rewrite** — the moment the client points at the new backend, downloads resolve there. Zero-downtime, reversible until the final old-bucket cleanup.

**What WOULD make it destructive (and how we avoid it):** hard-coding public/permanent Storage URLs in the DB (we don't — we store paths + sign on read), or coupling `storage_path` to Supabase-specific structure (we don't — it's a plain key). So the current design already dodges the two things that turn a storage move into a data-rewrite.

**When to revisit:** if monthly egress or stored volume crosses the plan's included tier, or if a client compliance requirement dictates a specific region/provider. At that point: introduce a `StorageAdapter` interface over the three operations, implement an S3/R2 backend, dual-write during cutover, backfill-copy history, verify, delete old. Logged as a *possible future* task, not scheduled.

**Note on `efd_receipt_no`:** surfaced during the D-068 introspection as a new live column; if it is intended to hold an uploaded receipt reference rather than a code string, that intersects this decision — flagged for clarification, not resolved here.

---

## D-070 — Roles UI: plain-English permission groups over `role_column_permissions`, with real read + write enforcement

**Date:** 2026-07-06
**Status:** Active — refines D-004 (permission model).

**Context.** The `/settings/roles` screen exposed a per-column matrix: one **Read** and one **Write** toggle for each of ~27 raw `snake_case` `consignments` columns (~54 switches). Two problems: (1) non-technical customs staff can't reason about raw column names; (2) the **Read** toggles were **not enforced anywhere on display** — turning off Read `amount` changed a DB row that no display code consulted, so amounts still showed on the dashboard, consignments list, detail, clients, and exports. The only read permission ever honored was the synthetic `audit_log`/`read` one (nav-gates the Activity page, D-064).

**Decision.** Replace the column matrix with a small set of **human-readable permission groups**, grouped into **Read access** and **Work access** and sub-grouped by section (Visibility / Consignments / Pipeline / EFD). Groups are a **presentation layer** over the existing `role_column_permissions` table — each group maps to one or more concrete `(table, column)` rows. Toggling a group fans out to all its underlying rows via `updateGroupPermAction`. Single source of truth: `src/lib/permission-groups.ts` (`PERMISSION_GROUPS`).

Groups shipped: *See financial amounts* (read `amount`), *View activity log* (read `audit_log`), *Add new consignments* (write `ref_no`), *Edit shipment details* (write 11 descriptive columns), *Edit client assignment* (write `client_id`), *Edit financial amounts* (write `amount`), *Update pipeline statuses* (write the 10 `*_status` columns + `shared_with_consignment_id`), *Manage EFD receipts* (write 6 `efd_records` columns).

**Read enforcement is now real** (the bug fix). Amounts are gated by `canRead("consignments","amount")` everywhere: dashboard revenue tile (hidden when off), consignments list, consignment detail + GUTA sibling, clients revenue (previously gated by a hard-coded `isAdmin`, now by the permission), and PDF/XLSX exports. Hidden values render a masked `•••` placeholder (`MASKED_AMOUNT` / `maskedTzs` in `src/lib/money.ts`) rather than disappearing, so layouts stay stable. Admins always pass (`canRead`/`canWrite` short-circuit true for admin).

**Advancing pipeline stages is now permission-driven, not role-name-driven.** Migration `20260706120000_roles_permissions_groups_and_efd_guard.sql`:
- Re-emits `advance_stage()` to gate on `can_user_write('consignments', <target status column>)` instead of the hard-coded `r.name in ('admin','operator')` check (D-029's gate is replaced by the column-permission check; the function is still `SECURITY DEFINER` and still bypasses the generic column guard for its `updated_by`/`release_date`/duty-propagation side effects).
- Adds `can_user_write_any(table)` and switches the `consignments`/`efd_records` table-level RLS UPDATE/INSERT policies from role-name checks to permission-row checks, so **custom roles** work.
- Adds an `efd_records` per-column BEFORE UPDATE guard mirroring the `consignments` one (D-046), and seeds operator (write) / viewer (read) EFD permission rows.

UI guards align with the DB: `stage-action-menu.tsx` now gates on `useColumnPermission("consignments", <stageField>).canWrite`; the kanban board already gated on `canWrite` per status column.

**Custom roles retained.** System roles (admin/operator/viewer) stay read-only in the UI; cloning opens the same group toggles (per user choice).

**Scope decisions (confirmed with user):** exports stay open to any authenticated user (only the amounts *inside* them are masked by the read group); "advance stage" was included in this pass rather than deferred; backward stage moves stay admin-only via `force_set_stage` (not a group).

**Why groups-over-columns rather than making the 54 toggles honest (Option A):** even fully enforced, 54 `snake_case` toggles are unusable for the target staff. Groups give a stable vocabulary ("See financial amounts") that maps to whatever columns implement it, and let the underlying column set evolve without changing the operator-facing UI.

**Verification surface:** clone a role, assign a test user, toggle each group, confirm both the UI change and a direct REST/RPC attempt (PATCH a guarded column; call `advance_stage` for a stage the role lacks) returns `42501`. `pnpm typecheck` + `pnpm lint` clean.

---

## D-071 — Pipeline restructure: New-Consignments intake bucket, blocking drop-popups, Consignment Nature + TBS skip, Duty Application reorder

**Date:** 2026-07-17
**Status:** Active — extends D-005 (kanban), D-009 (advance_stage as sole mutator), D-027 (pipeline constants), D-028 (ref_no allocation).

**Numbering note:** the plan doc `docs/plan-pipeline-nature-restructure.md` and an earlier build pass referred to this work as "D-070". D-070 was already taken by the Roles UI decision, so this restructure is **D-071**; all code + migration citations were corrected to D-071.

**Context.** The board started at "Manifest Uploaded". Creating a consignment demanded fields (exact arrival, ICD, TANSAD) that aren't known until processing begins — forcing operators to invent placeholder data. This adds a lightweight intake stage and defers the discovered-later fields to the exact moment they're first needed.

**Decisions (locked with user 2026-07-13, Ref-No semantics 2026-07-17):**

1. **"New Consignments" is a derived board bucket, not a new enum value.** A card is New while `manifest_status = 'Waiting'` AND `arrival_date IS NULL` (`isNewConsignment()` in `lib/pipeline.ts`). It leaves the bucket when the Manifest drop-popup sets the actual arrival + ICD and bumps `manifest_status → 'Action'`. No pipeline enum change.

2. **Estimated vs actual arrival are two columns.** New `estimated_arrival_date` (set at creation); `arrival_date` stays the ACTUAL arrival, set at the Manifest popup. Preserves the PRD §7.2 "no arrival ⇒ forced Waiting" rule and the §8.1 "arrival required before terminal states" guard.

3. **Blocking drop-popups collect discovered-later data** (`intake-dialog.tsx`). The drop opens the popup; the card only moves after required fields are saved; Cancel = card stays put (no optimistic move applied). Two popups:
   - **Manifest** (New → Manifest): actual `arrival_date` + `icd_id` (both required). Advances `manifest_status → Action`.
   - **Duty Application** (entering `tanesws`): `ref_no` + `tansad_no` (required) + `ucr_no` (optional). Advances `manifest_status → Uploaded` so the card lands in Duty Application.

4. **Ref No is editable at the Duty-Application popup, defaulting to the auto-generated value** (user, 2026-07-17). The field pre-fills with the card's existing `ref_no` (D-028 allocation) but the operator can overwrite it (e.g. to match the real customs declaration reference). Only sent in `p_extra` when changed; the `(ref_no, year)` unique index (`consignments_ref_no_year_uq`) is the collision backstop — a duplicate raises 23505 and aborts the advance. This makes `ref_no` a member of the `advance_stage()` `p_extra` whitelist.

5. **Consignment Nature (Import / Export / Transit) drives a DB-enforced TBS skip.** New `consignment_nature` enum + column (default 'Import' — historical/imported rows unaffected). For Export/Transit, once Assessment is Accepted, `advance_stage()` auto-completes both TBS stages (`tbs_loading=Done`, `tbs_debit=Paid`) with `'skipped (nature=…)'` stage_history rows, and the card visually jumps both columns. **The skip is written directly, NOT through the `tbs_debit='Paid'` branch — so it does NOT auto-pay duty. Duty stays Waiting and remains a real step** (user confirmed 2026-07-17: only TBS skips; Duty still runs for Transit/Export).

6. **Duty Application (`tanesws`) reordered before Shipping Batch** — app-layer only, in `PIPELINE_STAGES` order (D-027), not the DB enum. Verified no `advance_stage()` prerequisite depends on the old order: `tanesws→Done` still requires `manifest=Uploaded` (still precedes it); `shipping_batch` has no prerequisite. **Naming: two "Duty…" columns coexist — "Duty Application" (early, customs declaration) and "Duty" (later, payment). User chose to keep both names as-is** (2026-07-17).

7. **`p_extra jsonb` on `advance_stage()` keeps one sanctioned mutation path** (D-009). Whitelist fixed in SQL (`arrival_date, icd_id, ref_no, tansad_no, ucr_no`); any other key raises 22023; each supplied key is also `can_user_write()`-checked before the column-guard bypass. Popup write + stage advance are one atomic transaction.

**Migrations:** `20260713120000_consignment_nature_and_intake.sql` (enum + 3 columns + per-column perm seed, idempotent) and `20260713120500_advance_stage_nature_and_intake.sql` (`create or replace advance_stage()` with p_extra + TBS skip; also folds in the latent assessment `Closed→Accepted` fix). `src/types/supabase.ts` regenerated.

**Verification surface:** V-NATURE in `validation.md`. Key checks: create → lands in New; Manifest popup gates arrival+ICD; Duty popup gates ref+tansad (ucr optional, ref editable); Transit/Export skip both TBS columns with duty still Waiting; `p_extra` non-whitelisted key rejected; operator can write the new columns without 42501.
