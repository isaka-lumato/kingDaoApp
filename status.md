# Project Status — KDL Tracker

**Live state of the project.** Updated after every task.

---

## Snapshot

| Field | Value |
|---|---|
| **Phase** | 3 — Core Consignment CRUD ✅ COMPLETE (Phase 3.5 cleanup pending) |
| **Last updated** | 2026-05-20 |
| **Last task completed** | T-047 (Soft-delete flow with admin reason) |
| **Current task in progress** | — (Phase 3 done; Phase 3.5 cleanup next: T-048, T-049) |
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
- **Phase 3 (CRUD)** — Kanban (`/`) with DnD + `advance_stage` RPC + admin force-set dialog; Action Inbox (`/inbox`); Consignments table (`/consignments`) with filter set + pagination; Detail (`/consignments/[id]`, 3-tab); New form; Edit form (column-perm enforced); Duplicate action; Soft-delete with reason
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

---

## Open issues / known compromises

- **RLS bypass on read paths** — 7 server pages currently use the admin client for SELECT queries to make `clients(name)` / `icds(location)` joins work and to defeat a soft-delete visibility quirk. Logged as **D-026** and tracked by **T-048**. Must be fixed before Phase 4 (EFD/GUTA UI), and definitely before T-081 (security review).
- **Page latency** — Server-rendered pages currently make 3 serial `auth.getUser()` calls + 3 serial permission queries per request. From Tanzania → Supabase EU region this stacks to ~1.5–2s of latency before render. Tracked by **T-049**. Fix is `getClaims()` swap + React `cache()` wrapping + parallelizing the permission queries.

---

## Next 5 things, in order

1. **T-048** — Phase 3.5 cleanup: revert RLS bypass on read paths. Swap admin client → user-JWT server client on 7 server pages; verify joins work (post-`025325` they should); add explicit `deleted_at IS NULL` filters; manually verify viewer / operator / admin matrices.
2. **T-049** — Phase 3.5 perf: replace `getUser()` with `getClaims()` in the layout, wrap `getServerPermissions()` in React `cache()`, parallelize the role-lookup queries.
3. **T-050** — EFD management screen (`/efd`) — list/create/edit, PRIVATE/TRANSIT/SHARED, link to one or many consignments.
4. **T-051** — `in_ref` batch panel — open side panel of all siblings + totals when an `in_ref` link is clicked.
5. **T-052** — GUTA pair linkage UI on detail view — sibling card + red warning when one is released and the other isn't.

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
