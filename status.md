# Project Status — KDL Tracker

**Live state of the project.** Updated after every task.

---

## Snapshot

| Field | Value |
|---|---|
| **Phase** | 1 — Database schema (in progress) |
| **Last updated** | 2026-05-19 |
| **Last task completed** | T-010, T-011, T-018, T-019 (migrations live on dev) |
| **Current task in progress** | T-012 (consignments table) |
| **Blocked tasks** | None — CLI linked, types generated |
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
- `supabase/migrations/` — 4 migrations applied to dev:
  - `175744` helpers + audit log (with composite-PK fix inlined in `175820`)
  - `175800` enums (T-010)
  - `175810` clients + ICDs tables (T-011)
  - `175820` roles, role_column_permissions, user_roles, seed (T-018/T-019) + audit fix
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
| 2026-05-19 | T-025 done — `src/types/supabase.ts` regenerated from live dev DB. |

---

## Next 5 things, in order

1. **T-012** — `consignments` table with all PRD §5 fields, FKs, uniqueness constraints.
2. **T-013** — `in_ref_batches` table.
3. **T-014** — `efd_records` + `efd_record_consignments` join table.
4. **T-015** — `guta_pairs` table + auto-pair trigger.
5. **T-016/T-017** — `stage_history` table + attach audit triggers.

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
