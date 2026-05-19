# Project Status — KDL Tracker

**Live state of the project.** Updated after every task.

---

## Snapshot

| Field | Value |
|---|---|
| **Phase** | 1 — Database schema ✅ COMPLETE |
| **Last updated** | 2026-05-19 |
| **Last task completed** | T-024 (reporting views) + T-025 (types) |
| **Current task in progress** | — (Phase 1 complete; Phase 2 starts next) |
| **Blocked tasks** | None |
| **Production deployed?** | No |
| **Approach** | Cloud-only Supabase per D-019; flat Next.js repo per D-021 |
| **Stack confirmed running** | Next 16.2 · React 19.2 · Tailwind 4 · TypeScript 5 · Supabase JS 2.106 · zod 4.4 · date-fns 4.2 · Vitest 4.1 · Playwright 1.60 |

---

## What exists today

### Planning
- `PRD.md` (v1, frozen)
- `CLAUDE.md`, `tasks.md`, `validation.md`, `decisions.md` (D-001..D-023), `status.md`, `humanTasks.md`

### Code
- Next.js 16 app at repo root (App Router, TypeScript, Tailwind 4)
- shadcn/ui initialized on Base UI primitives (`base-nova` preset)
- `src/lib/supabase/{env,client,server,admin,middleware}.ts` — full client/server/admin/middleware wiring
- `src/middleware.ts` — refreshes Supabase session on every request
- `src/lib/{money,dates,query-keys}.ts` — shared formatters and centralized query keys
- `src/schemas/common.ts` — zod fragments (refNo, tansadNo, blNumber, year, amountTzs)
- `src/types/supabase.ts` — **generated from live dev DB** (regenerate after each migration)
- `supabase/config.toml` — CLI initialized and **linked to kdl-tracker-dev**
- `supabase/migrations/` — 11 migrations applied to dev (Phase 1 complete):
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
- `tests/unit/{money,dates}.test.ts` — 7/7 passing
- `tests/e2e/smoke.spec.ts` + `playwright.config.ts`
- `.env.local` (dev URL + publishable key; secret key still TODO from Baraka)

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

---

## Next 5 things, in order

1. **T-030** — Login page (`/login`) — email + password, sign-up disabled (admin invites only).
2. **T-031** — Session middleware: protect all routes, redirect unauthenticated → `/login`.
3. **T-032** — `usePermissions()` hook: fetch and cache user's resolved column permissions.
4. **T-033** — `<PermissionGate>` component that hides/disables fields based on the hook.
5. **T-034** — Settings → Users screen: invite by email, assign role, deactivate.

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
