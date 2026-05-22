# Validation Rules — Self-Check Before Marking a Task Done

This file is the **self-review checklist** Claude runs before claiming a task is `[x]`. Treat each section as a gate: every applicable item must pass.

If a check fails, the task stays `[~]` (in progress) and the failure is noted in `status.md`.

---

## V-G — Global (every task)

- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm lint` passes with zero errors and zero new warnings.
- [ ] Vitest tests for any touched file pass.
- [ ] No `console.log`, `// TODO`, or commented-out blocks left in shipped code.
- [ ] No secrets, service-role keys, or `.env*` content committed.
- [ ] Any new business rule outside the PRD has a corresponding `decisions.md` entry referenced in the commit.
- [ ] `status.md` updated.
- [ ] `tasks.md` updated.

---

## V-DB — Database / migrations

- [ ] `supabase db reset` on a fresh local DB succeeds — every migration applies from zero.
- [ ] Every table has `deleted_at timestamptz null` (unless the entity is intrinsically permanent, e.g. `audit_log`).
- [ ] Every user-facing table has RLS enabled (`alter table ... enable row level security`).
- [ ] Every user-facing table has explicit SELECT, INSERT, UPDATE, DELETE policies (no defaults).
- [ ] Foreign keys have explicit `on delete` rules — never the default.
- [ ] Indexes exist on every FK column and every column used in a frequent `where` clause.
- [ ] Generated types regenerated: `pnpm gen:types` ran after the migration.
- [ ] If destructive (drop col / rename), `decisions.md` records why and how data is preserved.

---

## V-PIPELINE — Pipeline rule enforcement

These are the PRD §8 invariants. The DB must reject violations, not just the UI.

- [ ] `arrival_date` NULL → every pipeline stage stays `Waiting`. Test: `advance_stage(...)` errors when arrival_date is null.
- [ ] `manifest_status != 'Uploaded'` → `tanesws_status = 'Done'` rejected.
- [ ] `assessment_status != 'Closed'` → `tbs_loading_status = 'Done'` rejected.
- [ ] `tbs_loading_status != 'Done'` → `tbs_debit_status = 'Paid'` rejected.
- [ ] `tbs_debit_status = 'Paid'` → `duty_status` auto-set to `'Paid'` by the function.
- [ ] `duty_status != 'Paid'` → `inspection_file_status = 'Done'` rejected (allowed only if `'SHARED'`).
- [ ] `inspection_file_status not in ('Done','SHARED')` → `release_status = 'Released'` rejected.
- [ ] `release_status = 'Released'` with NULL `release_date` → function defaults `release_date = current_date`.
- [ ] `container_type = 'CAR'` → `efd_code` auto-set to `'PRIVATE'`; `in_ref` prevented.
- [ ] `container_type = 'COIL'` & `icd != 'DP WORLD'` → soft warning written to `import_warnings` (or surfaced in UI).
- [ ] `tbs_debit_status = 'SHARED'` → `shared_primary_ref` required (foreign-keyed to a real consignment).
- [ ] Setting `efd_code` on a consignment with `in_ref_batch_id` propagates to all batch siblings (via the batch table, not row duplication).
- [ ] `tanesws_status = 'Done'` with NULL `tansad_no` → warning surfaced (not blocked).

Each rule needs at least one Vitest or SQL test in `tests/unit/pipeline/`.

---

## V-PERM — Permissions

- [ ] `current_user_can_write('consignments', 'amount')` returns the correct boolean for each of: admin, operator, viewer, custom-role-no-billing.
- [ ] Direct UPDATE via REST API as a viewer JWT is rejected by RLS.
- [ ] UI `PermissionGate` hides the field exactly when the API rejects writes.
- [ ] System roles (admin/operator/viewer) cannot be deleted (`is_system = true` enforced via trigger).
- [ ] A non-admin cannot mutate any row in `roles`, `role_column_permissions`, `user_roles`.
- [ ] **RLS-bypass audit (per D-026, tightened by D-030).** Run `grep -rn "getSupabaseAdminClient" src/` and confirm every match is one of the permitted call sites:
  - `src/lib/supabase/admin.ts` — definition itself.
  - `src/server/actions/settings-users.ts` — Supabase Admin API user CRUD (legitimately requires service role).
  - `src/server/actions/settings-roles.ts` — role/permission matrix mutations (admin-only).
  - ~~`src/server/actions/consignments.ts` — `forceSetStageAction`~~ — **removed in T-049 / D-030.** `forceSetStageAction` now calls the RPC via the user-bound server client so the SECURITY DEFINER guard inside `force_set_stage()` can read `auth.uid()`.
  Any other match is a regression and must be fixed before the task is marked done.
- [ ] **Soft-delete leak audit.** Every read path that doesn't use the admin client must include `.is("deleted_at", null)` in the SELECT clause. Manual check: a viewer hitting the detail URL of a soft-deleted consignment gets a 404, not the row.
- [ ] **`SECURITY DEFINER` caller-role gate (D-029).** Every `security definer` function in `supabase/migrations/` that performs INSERT/UPDATE/DELETE on a user-facing table has an explicit caller-role check (`raise exception '...' using errcode = '42501'`) as its first executable statement, before row locking or pre-condition checks. Direct REST verification: signing in as a viewer and `POST`ing to `/rest/v1/rpc/<function>` returns `42501`, not `200`. Current inventory: `advance_stage()` ✅, `force_set_stage()` ✅, triggers (`log_table_change`, `auto_detect_guta_pair`) ✅ (no mutations gated on caller). Pure functions (`current_user_can_write`, `is_admin`) — n/a.

---

## V-AUDIT — Audit trail

- [ ] Every UPDATE on a tracked table produces one row per changed column in `audit_log`.
- [ ] `audit_log.actor_id` matches the JWT subject of the request (test with two different users).
- [ ] Audit rows are never modifiable (RLS denies UPDATE/DELETE on `audit_log` for everyone, including admin).
- [ ] Soft deletes write an audit row with `column_name = '_deleted'`.

---

## V-REALTIME — Realtime

- [ ] Kanban open in two browsers: advancing a stage in browser A updates browser B within 2 seconds.
- [ ] Realtime subscription filters apply — viewing 2026 doesn't receive 2025 events.
- [ ] Disconnects auto-reconnect; the UI surfaces a "reconnecting" indicator.
- [ ] No infinite refetch loops (verify with React Query devtools — query count stable after one event).

---

## V-IMPORT — Excel import

- [ ] Year separator rows correctly split the data.
- [ ] Excel serial dates → ISO dates (sample: 45782 → correct date).
- [ ] Decimal time → HH:MM:SS (sample: 0.5321 → 12:46:18-ish, verify exact).
- [ ] Multi-EFD cells (e.g. `03429127, ..131`) produce multiple EFD records.
- [ ] Empty rows (REF + TANSAD both blank) skipped.
- [ ] REF No < 7 digits left-padded with `9` and flagged in `import_warnings`.
- [ ] Duplicate B/L within same year produces a row-level error in the preview.
- [ ] Confirm commits in a single transaction — partial failure rolls everything back.

---

## V-UI — UI quality

- [ ] All forms use react-hook-form + zod (no untyped `<input>` state).
- [ ] All money displayed via the shared formatter (`formatTzs(amount)` → `TSh 300,000`).
- [ ] All dates displayed in Africa/Dar_es_Salaam timezone via the shared formatter.
- [ ] Loading states: every async UI has a skeleton or spinner (no jarring layout shifts).
- [ ] Error states: every async UI has a visible error fallback (not just a console error).
- [ ] Empty states: every list view has a designed empty state with a primary CTA.
- [ ] Keyboard: kanban cards can be advanced via keyboard (arrow keys), not only drag.
- [ ] Color is never the only signal (icons + text alongside green/amber/red).

---

## V-MOBILE — Responsive

- [ ] At 375px width: kanban scrolls horizontally with column snap; cards are tappable.
- [ ] At 375px width: action inbox is the primary view; detail view stacks cleanly.
- [ ] Forms reflow to single column; no horizontal overflow.
- [ ] Tap targets ≥ 44×44px.

---

## V-PERF — Performance

- [ ] Consignment list (500 rows) initial render < 2s on a typical machine.
- [ ] Kanban drag-drop: no frame drops while dragging (DevTools Performance tab clean).
- [ ] No N+1 queries — every list query joins or batches.
- [ ] Realtime events do not trigger more than one query refetch per event.

---

## V-DEPLOY — Production deployment

- [ ] Migrations applied via `supabase db push`, never via Studio.
- [ ] Vercel preview URL works end-to-end before promoting to production.
- [ ] Production env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only), `RESEND_API_KEY`, `ALERTS_CRON_SECRET`.
- [ ] Legacy `anon` and `service_role` keys are **disabled** in the Supabase dashboard for both dev and prod.
- [ ] Admin can log in on production with a real invited account.
- [ ] Backup verified: Supabase daily backup setting enabled in dashboard.

---

## How to run a full pre-merge check (Phase 7 onward)

```powershell
pnpm typecheck;
if ($?) { pnpm lint };
if ($?) { pnpm test };
if ($?) { supabase db reset };
if ($?) { pnpm test:e2e }
```

All green = safe to merge.
