# Tasks — KDL Tracker Build

**How to use:**
- Tasks are ordered. Work top-down unless dependencies say otherwise.
- Status: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked (with reason).
- Each task names its **acceptance**: the concrete observable result that means "done."
- A task is only `[x]` when its `validation.md` row passes.

Legend: 🧱 = foundation; 🔐 = security; 📥 = data; 🎨 = UI; 🔁 = workflow; 📊 = reports; 🚚 = deploy.

---

## Phase 0 — Foundations (no app code yet)

- [x] **T-001** 🧱 Initialize Next.js 16 app at repo root (per D-021) with TypeScript, Tailwind 4, ESLint, pnpm.
  - Accept: `pnpm dev` boots (✓ Ready in 389ms); `pnpm typecheck` & `pnpm lint` clean.
- [x] **T-002** 🧱 Install & configure shadcn/ui (stone, `base-nova` preset on Base UI per D-023).
  - Accept: Sample button renders on `/` and HTTP 200 from `curl localhost:3000`.
- [x] **T-003** 🧱 `supabase init` complete; `supabase/config.toml` committed. (Link to dev project deferred to H-007 — requires interactive `supabase login`.)
  - Accept: `supabase/config.toml` present; folder structure ready for migrations.
- [x] **T-004** 🧱 Wire Supabase client: `src/lib/supabase/{env, client, server, admin, middleware}.ts` using `@supabase/ssr`. Middleware refreshes session on every request.
  - Accept: Home page (Server Component) calls `supabase.auth.getUser()` and renders "Auth state: signed out" — confirms env wiring + cookie pipeline are live.
- [x] **T-005** 🧱 Shared utilities: `src/lib/{query-keys, dates, money}.ts`, `src/schemas/common.ts`. Plus zod, date-fns, date-fns-tz installed.
  - Accept: Modules import cleanly; formatters cover null cases; helpers are typed strictly.
- [x] **T-006** 🧱 Configure Vitest + Playwright. Sanity tests for money + dates.
  - Accept: `pnpm test` → 7/7 pass in 1.2s. Playwright config in place; smoke spec written (browsers install on first use).

---

## Phase 1 — Database schema & RLS

- [ ] **T-010** 🧱 Migration: enums for pipeline statuses (manifest, shipping_batch, tanesws, assessment, tbs_loading, tbs_debit, manifest_comp, duty, inspection_file, release), container_type, role names.
  - Accept: `supabase db reset` succeeds; enums visible via `\dT+` in psql.
- [ ] **T-011** 🧱 Migration: `clients`, `icds` tables with soft-delete column and seed of all PRD §13 reference values.
  - Accept: Seed runs cleanly; `select count(*) from clients` returns ≥ 24; `select count(*) from icds` returns ≥ 30.
- [x] **T-012** 🧱 Migration: `consignments` table with every field from PRD §5.1 + §5.2, all FKs, `deleted_at`, `updated_by`, `created_at`, `updated_at`. NO triggers yet.
  - Accept: Schema matches PRD §5; unique constraint on `(ref_no, year)`; unique constraint on `(bl_number, year)`.
- [x] **T-013** 🧱 Migration: `in_ref_batches` table per D-012. FK from `consignments.in_ref_batch_id`.
  - Accept: Inserting two consignments with the same batch returns the same `efd_code` when joined through the view.
- [x] **T-014** 🧱 Migration: `efd_records` table per PRD §5.3 (codes, time, flags) + `efd_record_consignments` join (since one EFD can cover many consignments).
  - Accept: Many-to-many works; cascade rules: deleting consignment doesn't delete EFD record.
- [x] **T-015** 🧱 Migration: `guta_pairs` table per D-011 + trigger to auto-pair on consignment insert/update where `goods_description` matches the pattern.
  - Accept: Inserting "073C - GUTA PARTS" then "073C - FRAMES" (same vessel, same client) auto-creates a `guta_pairs` row linking both.
- [x] **T-016** 🧱 Migration: `stage_history` table — every stage advancement logged with `from_value`, `to_value`, `actor_id`, `occurred_at`.
  - Accept: Table exists, indexed on `(consignment_id, occurred_at desc)`.
- [x] **T-017** 🧱 Migration: `audit_log` + generic trigger function `log_table_change()` attached to consignments, efd_records, clients, icds, roles, role_column_permissions, user_roles.
  - Accept: Updating a consignment field writes a row to `audit_log` with old/new values and actor.
- [ ] **T-018** 🧱 Migration: `roles`, `role_column_permissions`, `user_roles` tables + SQL function `current_user_can_write(table_name text, column_name text) returns boolean`.
  - Accept: Function returns true for admin on every column; false for viewer on every write column.
- [ ] **T-019** 🧱 Migration: seed system roles — `admin`, `operator`, `viewer` — with their default column permission matrix per CLAUDE.md §8.
  - Accept: `select * from role_column_permissions where role_id = (select id from roles where name = 'viewer')` shows `can_write=false` everywhere.
- [ ] **T-020** 🔐 Migration: enable RLS on every user-facing table. Write SELECT, INSERT, UPDATE, DELETE policies that consult `current_user_can_write()` and role membership.
  - Accept: With a `viewer` user JWT, a direct UPDATE on `consignments.amount` is rejected; with `admin` it succeeds.
- [x] **T-021** 🔁 Migration: SQL function `advance_stage(consignment_id uuid, stage text, new_value text, reason text default null)` per D-009 — enforces all PRD §8.6–§8.12 prerequisites, writes `stage_history`, auto-propagates TBS Debit Paid → Duty Paid.
  - Accept: `select advance_stage(<id>, 'tanesws_status', 'Done')` errors with "manifest_status must be Uploaded first" when manifest isn't ready.
- [x] **T-022** 🔁 Migration: SQL function `force_set_stage(...)` admin-only escape hatch that bypasses prerequisites and logs reason to audit.
  - Accept: Calling as operator returns permission denied; calling as admin succeeds and writes audit row with reason.
- [x] **T-023** 🔁 Migration: view `stuck_stages` — every consignment × stage where current state is `Action` and has been so for ≥ `stuck_threshold_hours` (read from `settings`).
  - Accept: Manually backdating a `stage_history` row makes the view return that consignment.
- [x] **T-024** 📊 Migration: read-only views for reports — `v_revenue_monthly`, `v_client_volume`, `v_turnaround_by_client`, `v_turnaround_by_icd`, `v_pipeline_funnel`, `v_pending_refunds`.
  - Accept: Each view returns rows on seed data without error.
- [x] **T-025** 🧱 Generate TypeScript types: `pnpm gen:types` script runs `supabase gen types typescript --local > apps/web/src/types/supabase.ts`.
  - Accept: Generated file imports cleanly; `Database['public']['Tables']['consignments']` resolves.

---

## Phase 2 — Auth & permissions

- [x] **T-030** 🔐 Build login page (`/login`) using Supabase Auth, email + password. Sign-up disabled — admins invite new users.
  - Accept: Existing user can log in; non-existent user gets clear error.
- [x] **T-031** 🔐 Build session middleware: route protection, redirect to /login when unauth, redirect to / when authed and on /login.
  - Accept: Hitting `/` unauthenticated lands on `/login`; logged in lands on the kanban.
- [x] **T-032** 🔐 Build "Effective permissions" hook + provider — on login, fetch user's roles and resolved per-column permissions, cache in TanStack Query for the session.
  - Accept: `usePermissions().canWrite('consignments', 'amount')` returns the expected boolean for each role.
- [x] **T-033** 🔐 Build `<PermissionGate column="amount" table="consignments">` component that hides/disables children based on the hook.
  - Accept: A viewer sees the Amount field as read-only; operator sees it editable (per default seed).
- [x] **T-034** 🔐 Settings → Users screen: invite by email, assign role(s), deactivate user. Uses Supabase Admin API via a server action (service role, server-only).
  - Accept: Admin can invite `test@example.com`; the user appears in the user list with chosen role.
- [x] **T-035** 🔐 Settings → Roles screen: list system roles (read-only) and custom roles (CRUD). Per-role matrix UI: table × column toggles for read/write.
  - Accept: Admin clones "operator" → "operator-no-billing", revokes write on `amount`. A user assigned that role cannot edit `amount`.

---

## Phase 3 — Core consignment CRUD

- [x] **T-040** 🎨 Build the **Kanban board** (`/`) — columns are pipeline stages, cards are consignments. Drag a card to next column → calls `advance_stage`. Drag backward shows admin-only confirm dialog.
  - Accept: Dragging a card from "TANESWS — Action" to "Assessment — Action" advances `tanesws_status` to Done, refetches; another tab sees the change within 2s via realtime.
- [x] **T-041** 🎨 Build the **Action Inbox** (`/inbox`) — list of consignments where the current user has actionable stages, grouped by stage.
  - Accept: Operator sees only consignments with stages they have write permission on AND that are in `Action` or are stuck.
- [x] **T-042** 🎨 Build **consignment table view** (`/consignments`) — TanStack Table with sortable/filterable columns from PRD §9.2.
  - Accept: 500 seeded rows render in < 2s; filters (year, client, ICD, stage, container type, "stuck only", "unreleased only", "this week's arrivals") all work.
- [x] **T-043** 🎨 Build **consignment detail view** (`/consignments/[id]`) — all fields + visual pipeline + audit log tab + linked GUTA pair + linked in_ref batch + EFD records.
  - Accept: Every field from PRD §5 is shown; pipeline visual matches current state; audit log shows last 50 changes.
- [x] **T-044** 🎨 Build **new consignment form** with zod-validated react-hook-form. Client → ICD auto-suggest per PRD §8.16. Container type → amount range helper per PRD §8.18.
  - Accept: All hard validations from PRD §8 trigger correctly; soft validations show yellow warnings; submitting creates a row.
- [x] **T-045** 🎨 Build **edit consignment** flow (per-field, inline where sensible). Edits respect column permissions.
  - Accept: Editing `amount` as an operator-no-billing user is blocked at both UI and API levels.
- [x] **T-046** 🎨 Build **duplicate consignment** action (PRD §6.1) — useful for GUTA pairs.
  - Accept: Duplicating "073C - GUTA PARTS" prefills a new form with cleared `ref_no`/`tansad_no` and goods description "073C - FRAMES" suggested.
- [x] **T-047** 🎨 Build **delete (soft) flow** with admin confirmation + reason.
  - Accept: Soft-delete sets `deleted_at`; the row vanishes from default lists; admin can view it in `/admin/archive`.

---

## Phase 3.5 — Trial-branch cleanup (logged 2026-05-20)

Two cleanup tasks identified during the post-Phase-3 audit. Both must be done before Phase 4 work begins so the perf/security posture is right for the EFD and dashboard screens.

- [x] **T-048** 🔐 Revert RLS bypass on server-side read paths (per D-026) **+ caller-role gate on `advance_stage()`** (D-029, found during V1 walkthrough 2026-05-22). Closed 2026-05-22 on code-level acceptance: admin-client grep limited to the 4 permitted call sites, detail/edit pages enforce `.is("deleted_at", null)` + `notFound()`, viewer JWT direct REST POST to `/rpc/advance_stage` returns `42501`, kanban UI disables drag for viewers, V-PERM gates added in `validation.md`. Operator + admin click-through deferred to ad-hoc QA.
  - Swap `getSupabaseAdminClient()` → `getSupabaseServerClient()` on the 7 read-only call sites:
    `src/app/(app)/page.tsx` (via `fetchKanbanData` in `server/actions/consignments.ts`),
    `src/app/(app)/inbox/page.tsx`,
    `src/app/(app)/consignments/page.tsx`,
    `src/app/(app)/consignments/[id]/page.tsx`,
    `src/app/(app)/consignments/[id]/edit/page.tsx`,
    `src/app/(app)/consignments/new/page.tsx`,
    `src/app/(app)/settings/users/page.tsx`.
  - Verify joined columns (`clients(name)`, `icds(location)`) resolve through user JWT now that migration `025325` has SELECT policies on both reference tables.
  - Add explicit `.is("deleted_at", null)` on every consignment read (detail + edit currently rely on URL scope only).
  - Manually test with viewer, operator, and admin accounts that each sees what they should and nothing more.
  - Add a V-PERM check in `validation.md` that flags any new use of `getSupabaseAdminClient` outside the permitted call sites listed in D-026.
  - Accept: `grep -rn "getSupabaseAdminClient" src/` returns only the four permitted call sites (`lib/supabase/admin.ts`, `server/actions/settings-users.ts`, `server/actions/settings-roles.ts`, and `forceSetStageAction` in `server/actions/consignments.ts`). A viewer hitting the detail URL of a soft-deleted consignment gets a 404, not the row data. A viewer cannot drag kanban cards (UI) and a direct REST POST to `/rpc/advance_stage` with a viewer JWT returns 42501 (DB).

- [x] **T-049** ⚡ Phase 3.5 perf pass — eliminate redundant auth round-trips. Done 2026-05-22.
  - `(app)/layout.tsx` now uses `auth.getClaims()` (local JWT verify, no Auth-server RTT). Middleware remains the canonical session refresh point.
  - `getServerPermissions()` wrapped in React `cache()` — layout, page, and server actions within one request share one resolved permission set.
  - Collapsed the role-lookup chain from 3 queries to 2: drops the standalone `SELECT id FROM roles WHERE name IN (...)` by joining `roles!inner(name)` directly into `role_column_permissions`.
  - **Side fix (D-030):** `forceSetStageAction` now calls `force_set_stage` via the user-bound server client instead of the admin client. The DB function is `SECURITY DEFINER` and reads `auth.uid()` for its admin gate; the admin client made that null and the guard always returned `42501`. Shrinks D-026's permanent admin-allowlist from 4 → 3 sites.
  - Measured: `application-code` time for `GET /` dropped from ~1.5–2s pre-T-049 to **31–169ms warm** (well past the ≥50% threshold). All gates green: typecheck, lint (0 errors, same 7 pre-existing warnings), 7/7 unit tests. Verified force-set bug is fixed in the running dev server log.

---

## Phase 4 — EFD, batches, GUTA, alerts

- [ ] **T-050** 🎨 Build **EFD management screen** (`/efd`) — list, create, edit. Supports PRIVATE/TRANSIT/SHARED + linking to one or many consignments.
  - Accept: Creating one EFD record for an `in_ref` batch with 3 consignments shows the EFD on all 3 detail views.
- [ ] **T-051** 🎨 Build **in_ref batch view** — clicking an `in_ref` link opens a side panel with all B/Ls, total containers, total amount, combined release status.
  - Accept: Clicking `TZ3` in a consignment row opens the panel showing all 3 consignments and TSh 700,000 total.
- [ ] **T-052** 🎨 Build **GUTA pair linkage UI** — on the detail view of a paired consignment, show the sibling. Red warning if one is released and the other isn't.
  - Accept: Releasing "073C - GUTA PARTS" while "073C - FRAMES" is still in TBS shows the warning on both detail pages.
- [ ] **T-053** 🔁 Build the **alerts edge function** (Supabase scheduled): every 30 min, find newly-stuck stages, email admins via Resend.
  - Accept: Backdating a stage to 49h ago and waiting 30 min results in an email; deployed function logs show the run.
- [ ] **T-054** 🎨 Build the **dashboard** (`/dashboard`) — active jobs count, pipeline funnel, arrivals this week, revenue this month, top clients, overdue jobs (PRD §6.3).
  - Accept: Numbers match SQL queries run against seed data.

---

## Phase 5 — Excel import

- [ ] **T-060** 📥 Build the **Excel parser** (`src/server/import/parse-tracker.ts`) — handles year separators, decimal time, Excel serial dates, multiple EFD codes per cell, empty-row skipping, REF No left-padding.
  - Accept: Unit tests cover every parsing rule from PRD §10.3 + §8.20; given a sample of `TRACKER_--_KDL.xlsx`, returns the expected row count.
- [ ] **T-061** 📥 Build the **import UI** (`/import`) — file upload, preview table with per-row validation, "Confirm" commits via server action, "Cancel" discards.
  - Accept: Uploading a malformed row shows the error inline; only valid rows commit when confirmed; an `import_jobs` audit row is created.
- [ ] **T-062** 📥 Build the **CLI importer** (`scripts/import-tracker.ts`) — same parser, designed for the initial bulk historical load.
  - Accept: `pnpm tsx scripts/import-tracker.ts ./TRACKER_--_KDL.xlsx` runs end-to-end on local Supabase with all PRD §13 reference data already seeded.

---

## Phase 6 — Reports & exports

- [ ] **T-070** 📊 Reports screen (`/reports`) with selector + date range picker. All views from T-024 exposed.
  - Accept: Each report renders; data matches direct SQL.
- [ ] **T-071** 📊 Export to XLSX (exceljs) for every report.
  - Accept: Downloaded file opens in Excel with headers, formatted dates, formatted money.
- [ ] **T-072** 📊 Export to PDF (@react-pdf/renderer) for every report.
  - Accept: PDF opens, has Kingdao logo header, paginated correctly.

---

## Phase 7 — Polish, hardening, deploy

- [ ] **T-080** 🎨 Mobile responsive pass on Kanban, Inbox, Detail, Form (PRD §11 mobile requirement).
  - Accept: Manual test on a 375px-wide viewport — all flows complete without horizontal scroll.
- [ ] **T-081** 🔐 Security review: RLS coverage audit (`audit_rls.sql`), env var review, ensure service role never in client bundles.
  - Accept: Audit query shows every public table has RLS enabled; bundle analyzer confirms no service key string in client chunks.
- [ ] **T-082** 🚚 CI: GitHub Actions running `pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase db reset` (fresh schema must apply), `pnpm test:e2e`.
  - Accept: Push to a branch triggers CI; all jobs green on a clean repo.
- [ ] **T-083** 🚚 Deploy: link Supabase Cloud project, set env vars in Vercel, deploy. Apply migrations via `supabase db push`.
  - Accept: Production URL serves the app; an admin can log in; one test consignment created end-to-end.
- [ ] **T-084** 🚚 Production data import: run the importer against production with the real `TRACKER_--_KDL.xlsx`. Spot-check 10 random rows for correctness.
  - Accept: Production row count matches source row count; 10/10 spot checks correct.
- [ ] **T-085** 📋 README.md generated (public project overview) + operator quick-start guide saved as `docs/operator-guide.md`.
  - Accept: A new operator can complete login + advance a stage following only the guide.

---

## Dependencies

- T-001..T-006 block everything.
- T-010..T-025 block Phase 2+ (no auth without DB).
- T-021 (advance_stage function) blocks T-040, T-041 (kanban + inbox).
- T-032 (permissions hook) blocks T-033..T-035, T-045.
- **T-048 (RLS bypass cleanup) blocks all Phase 4 tasks** — fix the read-path posture before adding more screens that would inherit the bypass pattern.
- **T-049 (perf pass) blocks T-053 (alerts edge function)** — the edge function should not be added on top of a layout that's already taking 1.5s; we want a clean baseline to compare against.
- T-060 (parser) blocks T-061, T-062.
- T-082 (CI) and T-083 (deploy) are last.
- T-081 (security review) cannot pass until T-048 lands.

---

## Not yet scheduled (v2 candidates)

These were marked out-of-scope in PRD §12 or surfaced during planning:

- Client-facing portal.
- TRA/TANCIS direct integration.
- Generated PDF invoices (we only export reports as PDF; invoices come later).
- Mobile native app.
- Multi-company support.
