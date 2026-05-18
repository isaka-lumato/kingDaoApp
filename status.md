# Project Status — KDL Tracker

**Live state of the project.** Updated after every task.

---

## Snapshot

| Field | Value |
|---|---|
| **Phase** | 0 — Foundations ✅ COMPLETE |
| **Last updated** | 2026-05-18 |
| **Last task completed** | T-006 (test setup) |
| **Current task in progress** | — (Phase 0 ends here) |
| **Blocked tasks** | T-010..T-025 (Phase 1) blocked on H-007 (interactive `supabase login`) |
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
- `src/lib/supabase/{env,client,server,admin,middleware}.ts` — full client/server/admin/middleware wiring with the new publishable/secret keys
- `src/middleware.ts` — refreshes Supabase session on every request
- `src/lib/{money,dates,query-keys}.ts` — shared formatters and centralized query keys
- `src/schemas/common.ts` — zod fragments (refNo, tansadNo, blNumber, year, amountTzs)
- `src/types/supabase.ts` — stub (regenerated after first migration)
- `supabase/config.toml` — CLI initialized
- `tests/unit/{money,dates}.test.ts` — 7/7 passing
- `tests/e2e/smoke.spec.ts` + `playwright.config.ts`
- `.env.local` (with dev URL + publishable key; secret key still TODO from Baraka)
- `.env.example` (committed template)
- Git repo initialized on `main`, one commit so far

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

---

## Next 5 things, in order

1. **Baraka** runs H-007 (`supabase login` + `supabase link --project-ref vmkhiahoytuqnjpcxwrb`).
2. **Baraka** pastes the dev project's `sb_secret_...` into line 7 of `.env.local`. (Optional for now — only needed once we use the admin client for invites etc.)
3. **T-010** — enums migration (pipeline statuses, container types, role names).
4. **T-011** — `clients` + `icds` tables + seed of PRD §13 reference values.
5. **T-012** — `consignments` table with all PRD §5 fields + uniqueness constraints.

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
