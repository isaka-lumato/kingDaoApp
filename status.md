# Project Status — KDL Tracker

**Live state of the project.** Updated after every task.

---

## Snapshot

| Field | Value |
|---|---|
| **Phase** | 4 — in progress. T-050 + T-051 shipped. Next: T-052 (GUTA pair linkage UI). |
| **Last updated** | 2026-05-23 |
| **Last task completed** | T-051 (in_ref batch panel — right-side drawer + EFD auto-link to siblings per PRD §8.4) |
| **Current task in progress** | None — ready to pick up T-052 (GUTA pair linkage UI). |
| **Blocked tasks** | None |
| **Production deployed?** | No |
| **Active branch** | `trial` (not yet merged to `main`) |
| **Approach** | Cloud-only Supabase per D-019; flat Next.js repo per D-021 |
| **Stack confirmed running** | Next 16.2 · React 19.2 · Tailwind 4 · TypeScript 5 · Supabase JS 2.106 · zod 4.4 · date-fns 4.2 · Vitest 4.1 · Playwright 1.60 |

---

## What exists today

### Planning
- `PRD.md` (v1, frozen)
- `CLAUDE.md`, `tasks.md`, `validation.md`, `decisions.md` (D-001..D-028), `status.md`, `humanTasks.md`

### Code
- Next.js 16 app at repo root (App Router, TypeScript, Tailwind 4)
- shadcn/ui initialized on Base UI primitives (`base-nova` preset)
- `src/lib/supabase/{env,client,server,admin,middleware}.ts` — full client/server/admin/middleware wiring
- `src/middleware.ts` — Supabase session refresh + route protection (T-031)
- `src/lib/{money,dates,query-keys,pipeline,permissions}.ts` — shared utilities; pipeline state machine constants split out of server actions (D-027)
- `src/schemas/{common,auth}.ts` — zod fragments
- `src/types/supabase.ts` — **generated from live dev DB** (regenerate after each migration)
- `src/hooks/use-permissions.tsx` + `src/components/auth/permission-gate.tsx` — client-side perm hook + gate
- `supabase/config.toml` — CLI initialized and **linked to kdl-tracker-dev**
- `supabase/migrations/` — 12 migrations applied to dev (Phase 1 + RLS for reference tables):
  - `175744` helpers + audit log
  - `175800` enums (T-010)
  - `175810` clients + ICDs + seed (T-011)
  - `175820` roles, permissions, system role seed (T-018/T-019) + audit fix
  - `005000` consignments table (T-012)
  - `005200` efd_records + efd_record_consignments (T-014)
  - `005250` v_in_ref_batches view (T-013)
  - `005300` guta_pairs + auto-pair trigger (T-015)
  - `005400` stage_history + settings singleton (T-016/T-017)
  - `005500` advance_stage() + force_set_stage() (T-021/T-022)
  - `005600` v_stuck_stages + 6 reporting views (T-023/T-024)
  - `025325` RLS SELECT/WRITE policies for `clients` and `icds` (needed for dropdowns + joins)
- **Phase 2 (auth)** — `(auth)/login`, middleware route protection, server-side `getServerPermissions()`, `PermissionGate`, Settings → Users (invite/role/deactivate), Settings → Roles (clone + per-column matrix)
- **Phase 3 (CRUD)** — Kanban (`/`) with DnD + `advance_stage` RPC + admin force-set dialog; Action Inbox (`/inbox`); Consignments table (`/consignments`) with filter set + pagination; Detail (`/consignments/[id]`, 3-tab, now with Linked-EFDs section); New form; Edit form (column-perm enforced); Duplicate action; Soft-delete with reason
- **Phase 4 (EFD)** — EFD management at `/efd` (list with flag filter + code search + pagination), `/efd/new` (form + consignment picker + unreleased soft-warning + batch-prefill from `?from_batch=`), `/efd/[id]` (edit + add/remove links + admin-only delete). Server actions in `src/server/actions/efd.ts`. Schema `src/schemas/efd.ts`. Flags derived from code on the server; `is_shared` recomputed on every link change. **EFD auto-link to `in_ref` siblings** (PRD §8.4 line 433) via `expandToBatchSiblings()` in both `createEfdAction` and `linkConsignmentsAction`.
- **Phase 4 (in_ref)** — Batch panel drawer at `/consignments` and `/consignments/[id]` driven by `?batch=…&bc=…&by=…` URL params. Built from `_batch-panel/batch-panel.tsx` (client shell with ESC + backdrop close) + `_batch-panel/batch-panel-content.tsx` (server component fetching `v_in_ref_batches` + sibling rows). `BatchLink` chip wired into the consignments table (new IN REF column) and the consignment detail Core details section.
- `tests/unit/{money,dates}.test.ts` — 7/7 passing
- `tests/e2e/smoke.spec.ts` + `playwright.config.ts`
- `.env.local` (dev URL + publishable + secret key wired)

### Operational
- `fixtures/TRACKER -- KDL.xlsx` — historical data (gitignored)

---

## Recent activity

| Date | Event |
|---|---|
| 2026-05-18 | Planning artifacts created. Stack locked. Workflow style locked. Permission model locked. D-001..D-018 logged. |
| 2026-05-18 | D-019: switched to cloud-only Supabase (no local Docker). |
| 2026-05-18 | H-001 done — Node 24, pnpm 10.33, Git 2.54, Supabase CLI 2.98.2 verified. |
| 2026-05-18 | D-020: adopt new Supabase publishable/secret keys instead of legacy anon/service_role. |
| 2026-05-18 | H-002 done — dev + prod Supabase projects created. |
| 2026-05-18 | D-021: flat repo structure (no `apps/web/` monorepo). |
| 2026-05-18 | D-022: adopt Next.js 16 (current default), not 15 as originally planned. |
| 2026-05-18 | D-023: shadcn/ui on Base UI (the new shadcn default), not Radix. |
| 2026-05-18 | T-001 done — Next.js scaffold, typecheck + lint + dev all clean. |
| 2026-05-18 | T-002 done — shadcn/ui initialized, sample button renders. |
| 2026-05-18 | T-003 done — `supabase init` complete; `config.toml` committed. CLI link deferred to H-007. |
| 2026-05-18 | T-004 done — full Supabase client wiring (browser/server/admin/middleware); homepage SSR confirms env wiring works against dev project. |
| 2026-05-18 | T-005 done — money/date/query-keys utilities + zod schema fragments; deps installed. |
| 2026-05-18 | T-006 done — Vitest config + 7 passing unit tests; Playwright config + smoke spec. |
| 2026-05-19 | H-007 done — `supabase login` + `supabase link` to kdl-tracker-dev (vmkhiahoytuqnjpcxwrb). |
| 2026-05-19 | T-010 done — enums migration applied (`175800`). |
| 2026-05-19 | T-011 done — clients + icds tables applied (`175810`). |
| 2026-05-19 | T-018/T-019 done — roles, user_roles, role_column_permissions + system role seed applied (`175820`). Bugfix: audit_log.row_id made nullable for composite-PK tables. |
| 2026-05-19 | T-012 done — consignments table (all PRD §5 fields, FKs, RLS, audit trigger, uniqueness constraints). |
| 2026-05-19 | T-013 done — v_in_ref_batches view (computed, not a table, per D-012). |
| 2026-05-19 | T-014 done — efd_records + efd_record_consignments M:M join. |
| 2026-05-19 | T-015 done — guta_pairs table + auto_detect_guta_pair() trigger. |
| 2026-05-19 | T-016/T-017 done — stage_history + settings singleton + audit triggers. |
| 2026-05-19 | T-021/T-022 done — advance_stage() + force_set_stage() with full PRD §8 prerequisites. |
| 2026-05-19 | T-023/T-024 done — v_stuck_stages + 6 reporting views. |
| 2026-05-19 | T-025 done — supabase.ts regenerated from full Phase 1 schema. |
| 2026-05-19 | T-030..T-033 done — login, middleware route protection, permissions hook, PermissionGate. |
| 2026-05-19 | T-034 done — Settings → Users (invite/role/deactivate). Bugfix: switched invite-by-email to create-with-password to match Supabase v2 admin API. |
| 2026-05-19 | T-035 done — Settings → Roles + per-role × per-column permissions matrix. Phase 2 complete. |
| 2026-05-19 | T-040 done — Kanban board with DnD, `advance_stage` RPC, admin backward-move dialog. |
| 2026-05-19 | T-041/T-042 done — Action Inbox + Consignments table with filters and pagination. |
| 2026-05-19 | Bugfix — pipeline types extracted to `lib/pipeline.ts`; `"use server"` modules cannot export non-serializable values (see D-027). |
| 2026-05-19 | T-043/T-044 done — Consignment detail (3-tab) + new consignment form + `createConsignmentAction`. |
| 2026-05-19 | T-045 done — Edit form with column-level permission enforcement. |
| 2026-05-19 | Bugfix batch — dark-mode input contrast; sidebar logo; corrected `audit_log` column names. |
| 2026-05-19 | RLS bugfix — added SELECT policies for `clients` and `icds` (migration `025325`) so dropdowns + joins resolve. |
| 2026-05-19 | Schema bugfix — corrected `container_type` enum values to `40FT/20FT/CAR/COIL` and auto-generate `ref_no` + `serial_no` on insert (D-028). |
| 2026-05-19 | T-046/T-047 done — duplicate + soft-delete actions. Phase 3 complete. |
| 2026-05-20 | **Trial-branch audit by Baraka + Claude** — identified RLS-bypass-on-reads pattern across 7 server pages (see D-026); logged as T-048 cleanup. Identified perf regression from 3 serial `auth.getUser()` round-trips per request; logged as T-049. Documentation hygiene caught up (`status.md`, `decisions.md`, `tasks.md`, `validation.md`). |
| 2026-05-20 | T-048 code complete — swapped `getSupabaseAdminClient()` → `getSupabaseServerClient()` on 7 page files + `fetchKanbanData`. Added `.is("deleted_at", null)` on the `icds` reads that were missing it. Side-fix: replaced `<a href="/consignments/new">` with `<Link>` in `kanban-board.tsx` (was blocking the lint gate). Validation: `grep -rn getSupabaseAdminClient src/` returns only the 4 permitted call sites; typecheck + lint + tests all green. Manual viewer/operator/admin verification still owed before marking T-048 `[x]`. |
| 2026-05-22 | **D-029 logged + T-048 follow-up shipped.** Viewer walkthrough exposed that a viewer could drag kanban cards — root cause was `advance_stage()` being `SECURITY DEFINER` (bypasses RLS) without a caller-role check. Fixed in migration `20260522004757_advance_stage_role_check.sql` (applied to dev). UI guard added: `kanban-card.tsx` uses `useSortable({ disabled: !canDrag })` and the board's `handleDragEnd` refuses non-admin/operator. Verified via direct REST RPC with viewer JWT — returns `42501 Role admin or operator required`. Validation gates green. |
| 2026-05-22 | **T-048 closed on code-level acceptance.** Static gates: typecheck clean, lint 0 errors / 7 pre-existing unused-var warnings, 7/7 unit tests pass. Confirmed `getSupabaseAdminClient` is limited to the 4 permitted modules (`lib/supabase/admin.ts`, `settings-users.ts`, `settings-roles.ts`, `forceSetStageAction` in `consignments.ts`). Detail + edit pages filter `.is("deleted_at", null)` and `notFound()` on miss. V-PERM in `validation.md` already carries the RLS-bypass audit, soft-delete leak audit, and the D-029 `SECURITY DEFINER` caller-role gate. Operator + admin click-through deferred to ad-hoc QA per user direction. |
| 2026-05-22 | **T-049 done + D-030 logged.** (1) `(app)/layout.tsx` switched from `auth.getUser()` to `auth.getClaims()` (local JWT verify, no Auth-server RTT). (2) `getServerPermissions()` wrapped in React `cache()` — layout/page/actions in one request share one resolved permission set. (3) Role-lookup chain collapsed from 3 queries to 2 (joined `roles!inner(name)` into `role_column_permissions`). (4) Admin walkthrough surfaced a pre-existing bug: dragging cards *backwards* as admin failed with `force_set_stage requires admin role`. Root cause — `forceSetStageAction` called the RPC via the admin/service-role client, which made `auth.uid()` null inside the `SECURITY DEFINER` function and tripped its own `is_admin()` guard. Fixed by routing the RPC through the user-bound server client (server-action's `perms.isAdmin` check still runs first). This shrinks D-026's admin-client allowlist from 4 → 3 sites; `validation.md` V-PERM updated. **Measured:** `GET /` `application-code` time dropped from ~1.5–2s (pre-T-049 audit) to **31–169ms warm** on dev — past the ≥50% threshold by a wide margin. Gates green: typecheck clean, lint 0 errors / 7 pre-existing warnings, 7/7 unit tests, force-set RPC now returns `200` in the dev-server log. |
| 2026-05-23 | **T-050 done.** EFD management shipped — `/efd` (list with flag filter + code search + pagination), `/efd/new` (form + consignment multi-picker + amber soft-warning when linking an unreleased consignment per PRD §8.14), `/efd/[id]` (combined detail+edit with add/remove links + admin-only delete). Server actions in `src/server/actions/efd.ts`: create/update/delete + link/unlink. Flags hybrid model: PRIVATE/TRANSIT auto-derived from code via `normaliseFlagsFromCode` on the server; `is_shared` always recomputed from link count (≥ 2). Consignment detail (`consignments/[id]/page.tsx` + `consignment-detail.tsx`) now queries `efd_record_consignments → efd_records` and renders a "Linked EFD records" section on the Overview tab — acceptance criterion (one EFD on all linked consignments' detail views) met. New zod schema at `src/schemas/efd.ts`. V-EFD added to `validation.md`. Gates: typecheck clean, lint 0 errors / 7 pre-existing warnings, 7/7 unit tests. Admin-client allowlist (D-026) stays at 3 sites — no new uses introduced. |
| 2026-05-23 | **T-051 done.** `in_ref` batch panel shipped + PRD §8.4 EFD-sibling auto-link wired. Right-side drawer at `/consignments` and `/consignments/[id]` driven by `?batch=&bc=&by=` URL params (shareable, browser-back closes); closes via X, Esc, backdrop. Built `_batch-panel/batch-panel.tsx` (client shell) + `_batch-panel/batch-panel-content.tsx` (server component fetching `v_in_ref_batches` + siblings) + `src/components/batch-link.tsx` (chip). IN REF column added to consignments table (lg breakpoint) and a Field on consignment detail Core details. `expandToBatchSiblings()` in `src/server/actions/efd.ts` auto-expands the selection to every consignment sharing `(in_ref, client_id, year)` from both `createEfdAction` and `linkConsignmentsAction` — idempotent via existing `ignoreDuplicates` upsert. Drawer's "Create EFD for this batch" CTA deep-links to `/efd/new?from_batch=&client=&year=` and the page pre-selects every sibling. Types regenerated via `pnpm gen:types:dev` (`v_in_ref_batches` now in `Database['public']['Views']`). V-BATCH added to `validation.md`. Gates: typecheck clean, lint 0 errors / 7 pre-existing warnings, 7/7 unit tests. Admin-client allowlist (D-026) stays at 3 sites. |

---

## Open issues / known compromises

- **Operator + admin walkthrough still owed as ad-hoc QA.** T-048 was closed on code-level acceptance (viewer was verified DB-side 2026-05-22). Joined columns (`clients.name`, `icds.location`) resolve through user JWT after migration `025325` and were confirmed during the viewer walkthrough, but the operator/admin matrices haven't been clicked through end-to-end. Surface anything that breaks as a new task rather than re-opening T-048.
- ~~**Page latency** — Server-rendered pages currently make 3 serial `auth.getUser()` calls + 3 serial permission queries per request.~~ **Resolved by T-049 on 2026-05-22.** Layout now uses `getClaims()` (local verify), `getServerPermissions()` is `cache()`-memoised per request, and the role-lookup chain is 2 queries instead of 3. `application-code` time on `GET /` is now 31–169ms warm. Middleware's `proxy.ts` time (~300–1500ms in dev logs) is the remaining latency, dominated by the canonical `getUser()` call — that's the security-critical session refresh and stays.
- **@dnd-kit hydration warning on kanban.** Setting `DndContext` `id="kanban-dnd"` (commit `443f17a`) didn't fully resolve it — `useSortable` (cards) and `useDroppable` (columns) also bump the same module-level counter. Console-only warning, not a crash; drag handlers + RPCs work correctly. Follow-up: try `useId()` on the board, or `next/dynamic({ ssr: false })`. Logged as a follow-up after T-048 closes.
- **Column-level UPDATE policy is app-layer only.** The `consignments_update` RLS policy from migration `005000` lets any operator/admin update any column — it does not call `can_user_write(table, column)` per-column as CLAUDE.md §8 envisioned. The DB function exists; no policy uses it. The application layer (server actions + `PermissionGate`) currently carries the enforcement. Worth tightening before T-081 (security review).

---

## Next 5 things, in order

1. **T-052** — GUTA pair linkage UI on detail view — sibling card + red warning when one is released and the other isn't.
2. **T-053** — Alerts edge function (Resend + Supabase scheduled) — newly-stuck stages email admins every 30 min. Unblocked now that T-049 has set a clean latency baseline.
3. **T-054** — Dashboard with active jobs, pipeline funnel, arrivals this week, revenue, top clients, overdue jobs. The "Released but no EFD" flag is now feasible to surface (PRD §8.14) since EFD records have first-class link state.
4. **Ad-hoc QA + follow-ups** — operator + admin click-through of `/efd` and `/consignments` (batch drawer) end-to-end against the dev DB (V-EFD + V-BATCH checks). Verify the batch auto-link behaves correctly when a sibling is soft-deleted mid-link. Plus the residual @dnd-kit hydration warning on the kanban — try `useId()` or `next/dynamic({ ssr: false })`.
5. **T-060** — Excel parser scaffolding (Phase 5 head-start) — read sample of historical tracker, draft year-separator + Excel-serial-date handling. Just the parser module + Vitest cases; UI in T-061.

---

## Outstanding questions

None. All known questions are answered or scheduled as future tasks.

---

## How to update this file

After every completed task, append to "Recent activity" and update:
- the Snapshot table,
- the "Next 5 things" list,
- any new questions or risks.

Keep entries terse — one line each.
