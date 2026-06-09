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
- [ ] **Per-column UPDATE guard at the DB (D-046).** The `consignments_aaa_column_write_guard` BEFORE UPDATE trigger (migration `20260525090000`) must reject a non-admin direct REST PATCH of a non-writable column with `42501`. Direct REST verification with an **operator** JWT against the dev project:
  - `PATCH /rest/v1/consignments?id=eq.<id>` body `{"amount":999}` → **42501** ("Permission denied: you may not modify consignments.amount").
  - body `{"client_id":"<other-uuid>"}` → **42501**.
  - body `{"remarks":"ok"}` → **200/204** (operator-writable).
  - body `{"in_ref":"TZ9"}` → **200/204** (proves the `in_ref_batch_id`→`in_ref` seed fix).
  - body `{"remarks":"x","amount":<current amount>}` → **200/204** (unchanged `amount` is not flagged — `is distinct from` per-column logic).
  - `POST /rest/v1/rpc/advance_stage {p_id,p_stage:"manifest",p_new_value:"Uploaded"}` → **200** even though it writes `updated_by` (tx-local GUC bypass works).
  With an **admin** JWT: `PATCH {"amount":500}` → **200/204** (`is_admin()` short-circuit). With a **viewer** JWT: any PATCH → **403** from the policy `using` role gate (guard never reached).
- [ ] **RLS coverage audit (T-081 deliverable).** Run `audit_rls.sql` against the project (Supabase SQL editor or `psql -f audit_rls.sql`). Query 1 must show `rls_enabled = true` for **every** `public` table. Query 3 must show no permissive hard-DELETE policy on `consignments`/`clients`/`icds` (efd_records admin-only DELETE is the documented exception). Query 4 must list the `consignments_aaa_column_write_guard` trigger.

---

## V-EFD — EFD management (`/efd`)

T-050 gates. Run when touching `/efd`, `src/server/actions/efd.ts`, the EFD-linkage section on consignment detail, or any code that writes `efd_records` / `efd_record_consignments`.

- [ ] Creating an EFD with `efd_code = "PRIVATE"` persists `is_private = true` regardless of the form checkbox (server-side derivation in `normaliseFlagsFromCode`).
- [ ] Same for `efd_code = "TRANSIT"` → `is_transit = true`.
- [ ] `is_shared` reflects link count: `false` for 0 or 1 link, `true` for ≥ 2. Verified after create, link, and unlink (server calls `recomputeIsShared`).
- [ ] Linking a consignment whose `release_status != 'Released'` still succeeds, but the new-EFD form shows the amber soft-warning under the picker. (PRD §8.14: soft validation, not a hard block.)
- [ ] Delete button on `/efd/[id]` is hidden for non-admin users; `deleteEfdAction` returns `{ error: "Admin only." }` if a non-admin invokes it directly.
- [ ] New EFD records do **not** appear in `/efd` for unauthenticated visitors (route protected by middleware) and an unauthenticated direct REST POST to `/rest/v1/efd_records` returns 401.
- [ ] Viewer JWT direct REST POST to `/rest/v1/efd_records` returns 403 (RLS rejects insert).
- [ ] Creating one EFD record and linking it to ≥ 2 consignments surfaces a "Linked EFD records" row on each of those consignment detail pages (`/consignments/[id]`), with the SHARED badge.
- [ ] Unlinking the last consignment leaves the EFD record in place (no cascade) and flips `is_shared` to false.
- [ ] Deleting an EFD record removes all join rows via FK cascade; the linked consignments are untouched.
- [ ] `getSupabaseAdminClient` is **not** introduced anywhere under `src/app/(app)/efd/` or `src/server/actions/efd.ts`. The admin-client allowlist in D-026 stays at 3 sites.

---

## V-BATCH — `in_ref` batch panel (`/consignments` drawer)

T-051 gates. Run when touching `_batch-panel/`, `src/components/batch-link.tsx`, the in-ref column on the consignments table, the in-ref Field on consignment detail, or the auto-link path in `src/server/actions/efd.ts`.

- [ ] Clicking the IN REF chip in the consignments table sets `?batch=<inref>&bc=<client_id>&by=<year>` and slides the right drawer in. The underlying list stays visible.
- [ ] Clicking the IN REF chip in consignment detail opens the same drawer at the detail page URL.
- [ ] Drawer closes via the X button, the Esc key, and clicking the backdrop. All three clear `batch`, `bc`, `by` from the URL.
- [ ] Summary card numbers match a direct query: `SELECT consignment_count, total_containers, total_amount FROM v_in_ref_batches WHERE in_ref=$1 AND client_id=$2 AND year=$3`.
- [ ] Sibling list shows every non-deleted consignment in `(in_ref, client_id, year)`. Soft-deleted siblings are excluded.
- [ ] "Create EFD for this batch" CTA is hidden for viewers, hidden when `efd_code` already exists on the batch, and visible only for admin/operator otherwise. It links to `/efd/new?from_batch=…&client=…&year=…`.
- [ ] `/efd/new?from_batch=TZ3&client=…&year=…` pre-selects every sibling in the picker on initial render.
- [ ] **EFD auto-link (PRD §8.4 line 433):** creating an EFD with **only one** of N siblings selected results in all N consignments being linked. Verified by opening the EFD detail page after save.
- [ ] `linkConsignmentsAction` from `/efd/[id]` likewise pulls in batch siblings — adding one sibling adds the rest.
- [ ] **Idempotency:** re-issuing the create with the same IDs produces no duplicate join rows and no error (the `ignoreDuplicates: true` upsert handles it).
- [ ] **Non-batch consignment** (`in_ref IS NULL`): EFD links exactly the one consignment selected — no spurious expansion.
- [ ] `is_shared` flips to `true` on any EFD where expansion produced ≥ 2 links (via `recomputeIsShared`).
- [ ] **RLS sanity (D-026):** `getSupabaseAdminClient` is not introduced anywhere under `src/app/(app)/consignments/_batch-panel/` or in the new code paths of `src/server/actions/efd.ts`. Admin-client allowlist stays at 3 sites.
- [ ] **Generated types refresh:** `v_in_ref_batches` is present in `Database['public']['Views']` in `src/types/supabase.ts`.

---

## V-GUTA — GUTA pair linkage UI (`/consignments/[id]`)

T-052 gates. Run when touching the GUTA pair section in `consignment-detail.tsx`, the pair fetch in `consignments/[id]/page.tsx`, or the `auto_detect_guta_pair()` trigger.

- [ ] On a consignment with `guta_pair_id` set, the Overview tab shows a "GUTA pair" section with the batch code badge, the sibling's REF No (linked to its detail page), B/L, container count × type, amount, and release status badge.
- [ ] The badge correctly identifies which role this record plays ("this is PARTS" or "this is FRAMES"), determined from `guta_pairs.parts_consignment_id` vs `frames_consignment_id`.
- [ ] On a consignment with no pair (`guta_pair_id IS NULL`), the section is hidden — no empty card.
- [ ] **Red warning fires when exactly one of the two is released.** Releasing "073C - GUTA PARTS" while "073C - FRAMES" is still in TBS shows the warning on **both** detail pages. Warning message names the unreleased sibling by REF No.
- [ ] When **both** are released or **neither** is released, no warning shows.
- [ ] Clicking the sibling card navigates to `/consignments/<sibling-id>` (next.js `<Link>`).
- [ ] **Soft-delete safety:** if the sibling has been soft-deleted, the sibling fetch returns no row and the section does not render (no broken link, no crash).
- [ ] **RLS sanity (D-026):** the pair + sibling queries on `consignments/[id]/page.tsx` use `getSupabaseServerClient` (user JWT), not `getSupabaseAdminClient`. Admin-client allowlist stays at 3 sites.
- [ ] **Auto-pair trigger still works:** inserting "073X - GUTA PARTS" then "073X - FRAMES" (same client + vessel + year) creates a `guta_pairs` row and backfills `guta_pair_id` on both consignments. Section appears on both detail pages on next load.

---

## V-DASH — Dashboard (`/dashboard`)

T-054 gates. Run when touching `src/app/(app)/dashboard/`, the navigation order in `app-shell.tsx`, or any of the reporting views (`v_pipeline_funnel`, `v_revenue_monthly`, `v_client_volume`, `v_stuck_stages`).

- [ ] All four KPI tiles render: "Released today", "Pending release", "Stuck > 48h", and "Revenue · <Month YYYY>". Numbers match direct SQL against the underlying tables/views for the current `year`.
- [ ] "Released today" counts only `release_status = 'Released' AND release_date = CURRENT_DATE AND deleted_at IS NULL`.
- [ ] "Pending release" counts every non-deleted consignment with `release_status != 'Released'` — across all years (no year filter on this KPI).
- [ ] "Stuck > 48h" matches `SELECT COUNT(*) FROM v_stuck_stages` capped at 10 (display truncates to top 10; the count shown is the rendered list length).
- [ ] "Revenue · <month>" sums `consignments.amount` where `release_status = 'Released' AND release_date >= first-of-current-month AND amount IS NOT NULL AND deleted_at IS NULL`. Footer shows the exact value via `formatTzs`; the tile shows the compact form via `formatTzsCompact`.
- [ ] **Pipeline funnel** bars show all 10 Action stages from `v_pipeline_funnel` for the current year (Manifest, Shipping, TANESWS, Assessment, TBS Load, TBS Debit, Mfst Comp, Duty, Inspection, Ready). Bar widths are relative to the largest single stage; minimum width 2% so empty stages remain visible.
- [ ] Funnel footer shows `released` and `total_active` from the view.
- [ ] **Top clients** lists the 5 highest `total_containers` from `v_client_volume` for the current year only. Each row shows client name, sub_label (when set), container count, and job count.
- [ ] **Arrivals this week** lists consignments with `arrival_date` in the current Mon→Sun window (calendar week, not rolling 7 days), ordered ascending, capped at 20. Each row links to `/consignments/[id]`.
- [ ] Week boundaries are inclusive of Monday 00:00 and exclusive of next Monday 00:00 — a Sunday-arrival consignment shows up, a next-Monday-arrival does not.
- [ ] **Overdue jobs** lists the top 10 rows from `v_stuck_stages` ordered by `hours_stuck DESC`. Each row shows REF No, year, client, stage label (mapped from DB enum via `stageLabelFor`), relative `stuck_since`, and the integer hours stuck. Each row links to its consignment detail.
- [ ] Empty states render gracefully: "No vessel arrivals scheduled this week", "✅ Nothing is stuck right now", "No client data yet for <year>".
- [ ] When any of the 7 parallel queries errors, a red banner explains the partial failure but the other widgets still render with their fallback data.
- [ ] **RLS sanity (D-026):** the page uses `getSupabaseServerClient` (user JWT). `grep -n "getSupabaseAdminClient" src/app/(app)/dashboard/` returns no matches. Admin-client allowlist stays at 3 sites.
- [ ] **Viewer access:** a viewer (no write permissions) can load `/dashboard` and sees the same KPIs the data warrants. The sidebar "Dashboard" entry is unconditional (not gated by `roles`), so every signed-in user sees the link.
- [ ] **Navigation:** the sidebar order is Dashboard → Pipeline → Consignments → Inbox → EFD Records → Reports → Settings. `/` continues to render the Kanban board (no route changes besides the new entry).
- [ ] **Released-but-no-EFD flag** (PRD §8.14 / status.md follow-up): tracked separately as a Phase-4 follow-up; this dashboard does **not** yet surface it. Mark this row N/A and link the follow-up task ID when it lands.

---

## V-ALERT — Stuck-job alerts edge function

T-053 gates. Run when touching `supabase/functions/alerts/`, `stuck_alerts`, `claim_new_stuck_alerts()`, `reset_resolved_stuck_alerts()`, or the cron schedule on the dev Supabase project.

- [ ] **Migration applied.** `supabase migration list --linked` shows `20260523163840_stuck_alerts`. `stuck_alerts` table exists in `kdl-tracker-dev` with PK `(consignment_id, stage)` and one index on `alerted_at desc`. RLS enabled with SELECT-only policy for `authenticated`.
- [ ] **Generated types refreshed.** `Database['public']['Tables']['stuck_alerts']` and `Database['public']['Functions']['claim_new_stuck_alerts']` are present in `src/types/supabase.ts`.
- [ ] **Bearer-token gate.** A POST to the function's URL without the `Authorization: Bearer <ALERTS_CRON_SECRET>` header returns `401 Unauthorized`. With the correct header it proceeds.
- [ ] **Empty case.** Running the function when nothing is in `v_stuck_stages` returns `{"sent":0,"claimed":0,"reset":<n>}` and sends no email.
- [ ] **First-fire case (T-053 acceptance).** Backdating any `stage_history` row to 49h ago so the row appears in `v_stuck_stages`, then invoking the function, returns `claimed:1` and `sent:<admin-count>`. One digest email lands in each admin inbox within ~10s.
- [ ] **Dedup case.** Immediately invoking the function a second time with no DB change returns `claimed:0`. No email is sent.
- [ ] **Re-alert case.** After Step 5 above, advance the stage out of Action via `advance_stage(...)`. Wait. Then backdate it again. The next function run returns `claimed:1` — the dedup ledger has been cleared by `reset_resolved_stuck_alerts()` because the pair left `v_stuck_stages` between runs.
- [ ] **Digest format.** Email subject is `[KDL] <n> consignment(s) newly stuck`; body lists each row as REF · year · client · stage · hours, with a deep-link to `${APP_URL}/consignments/<id>` and a footer link to `${APP_URL}/dashboard`. Both `text` and `html` parts are present.
- [ ] **Admin resolution.** Adding a new user to the `admin` role causes them to receive the next run's digest without redeploying the function. Removing a user from `admin` stops their emails on the next run.
- [ ] **No new app-bundle deps.** `supabase/functions/alerts/index.ts` imports only `https://esm.sh/@supabase/supabase-js@…`. No SDK for Resend, no Node-only modules. Function file is excluded from the Next.js `tsconfig` (verify by `pnpm typecheck` succeeding with the file present).
- [ ] **RLS / admin-client allowlist (D-026).** No new uses of `getSupabaseAdminClient` introduced in the Next.js app. Edge function uses the service-role key — this is expected and unrelated to D-026 (D-026 governs the Next.js app's RLS posture; edge functions run server-side with the service role by design).
- [ ] **Cron schedule active.** `*/30 * * * *` schedule exists in Studio → Edge Functions → alerts → Schedules. The HTTP header is set to `Authorization: Bearer <ALERTS_CRON_SECRET>`. After at least one cron tick has elapsed, the function logs show one invocation per half-hour, each returning a JSON body.

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

## V-PARSER — Excel parser (T-060)

Pure function, fully unit-tested. Re-run after any change to `src/server/import/parse-tracker.ts`:

- [ ] `pnpm test tests/unit/parse-tracker.test.ts` — all 28 cases green.
- [ ] No SheetJS / `xlsx` import in `parse-tracker.ts` — `grep -n xlsx src/server/import/parse-tracker.ts` is empty (D-035: parser stays pure; SheetJS lives in T-061/T-062 adapters).
- [ ] Header alias map covers every PRD §5 "Source Column" name; `REQUIRED_HEADERS` is the smallest set that must be present (currently `ref_no` + `container_type`).
- [ ] When the source tracker layout changes (new columns, renamed columns), update `HEADER_ALIASES`, add a Vitest case proving the new header maps to the right `LogicalField`, and only then ship.
- [ ] `errors[]` represents rows excluded from import; `warnings[]` represents rows included with soft issues (D-036). Don't merge these into one bucket without bumping the decision.
- [ ] Cross-field rules (§8.5, §8.19) are warnings only — never block import based on amount range or TANSAD-missing.

---

## V-IMPORT — Excel import UI (T-061)

Run after any change to `/import`, `src/server/import/*`, or the `import_jobs` schema:

- [ ] Visiting `/import` as a **viewer** redirects to `/dashboard` (server-side check in `page.tsx`); as **operator** or **admin** the page renders.
- [ ] Uploading a file with header mismatches (e.g. drop the REF No column) produces an error in the preview panel, not a thrown stack trace.
- [ ] Uploading the canonical tracker fixture shows: parsed > 0; auto-create chips empty (clients + ICDs already seeded per PRD §13); skipped includes year-separator + header rows.
- [ ] Uploading a row with `client_name` not in `clients` shows the auto-create chip in the preview. After Confirm, the new client appears in `Settings → Clients` with `name` uppercased.
- [ ] An `import_jobs` row is INSERTed with `status='previewed'` on upload; UPDATEd to `'committed'` on Confirm with `inserted_count` matching the success count and `committed_at` populated. As admin in Supabase Studio: `select status, parsed_count, inserted_count from import_jobs order by created_at desc limit 5;` should reflect recent imports.
- [ ] As operator, `select * from import_jobs` returns only the operator's own jobs (RLS verified).
- [ ] `xlsx` is **never** imported by a `"use client"` component (`grep -rn '"use client"' src | xargs grep -l xlsx` is empty). It must stay server-only — bundling SheetJS into the client would add ~500KB.
- [ ] Confirm with zero parsed rows (all errors) does not produce an INSERT into `consignments`; the audit row's `status` ends as `'committed'` with `inserted_count=0` (a no-op confirm is allowed; the UI button is disabled when parsed=0, but the action must still be safe if called directly).
- [ ] Auto-created clients/ICDs are sanity-checked manually for duplicates (e.g. `PAPA - SAAJT` vs `PAPA-SAAJT`) — per D-037 the trade-off is admin-merges-afterward; this is intentional but needs an occasional review.

---

## V-IMPORT-CLI — CLI tracker importer (T-062)

Run after any change to `scripts/import-tracker.ts`, its npm script entry in `package.json`, or the shared `parseTracker` it depends on.

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean (script is included in the Next.js `tsconfig.json` glob via `**/*.ts`).
- [ ] `pnpm import:tracker --help` prints the usage block and exits 0.
- [ ] `pnpm import:tracker <missing>.xlsx` prints `Could not read input file: …` and exits 1.
- [ ] Banner prints `DRY-RUN` (yellow) by default and the correct `DEV` / `PROD` / `UNKNOWN` label for the URL in `.env.local`. When `NEXT_PUBLIC_SUPABASE_URL` does not match either known project ID, the banner shows `UNKNOWN` and a warning is sent to stderr.
- [ ] Dry-run against the real tracker (`pnpm import:tracker fixtures/TRACKER_--_KDL.xlsx`) prints parser summary, auto-create lists, and writes `tmp/import-preview-<ts>.json`. **Zero DB writes** — `select count(*) from import_jobs` is unchanged after the run.
- [ ] `--no-auto-create` against a file containing unknown clients/ICDs exits non-zero with a clear listing.
- [ ] `--commit` requires typing `IMPORT` on stdin; any other input aborts. When stdin is not a TTY and `--yes` is not passed, the script aborts with a clear message rather than silently committing.
- [ ] Small-fixture commit (3 rows) inserts exactly 3 consignments visible at `/consignments`, on the kanban, and reflected in the `/dashboard` KPIs. The `import_jobs` row lands in `status='committed'` with `inserted_count=3`, `committed_at` set, and `payload.source='cli'`.
- [ ] Re-running the same commit fails per-row on the `(ref_no, year)` unique constraint; the `import_jobs` row lands in `status='failed'` with `inserted_count=0` and `payload.failures[]` listing each offending row.
- [ ] Admin client + audit log: rows inserted by the CLI carry `audit_log.actor_id = NULL` (expected per D-038 — the `import_jobs` row provides the provenance instead).
- [ ] Progress indicator prints every 25 rows when stdout is a TTY; suppressed when piped.
- [ ] Exit codes: `0` clean run; `1` arg / env / file errors; `2` commit completed with at least one row failure.
- [ ] `getSupabaseAdminClient` is **not** introduced under `src/`. The CLI builds its own admin client inline (consistent with `scripts/create-viewer-user.mjs`). D-026 allowlist stays at 3 sites.
- [ ] `tmp/.gitignore` excludes the dry-run preview dumps from version control.

---

## V-REPORTS — Reports screen (T-070)

Run after any change to `src/app/(app)/reports/`, the T-024 views, or any of the underlying source tables. T-071 (XLSX) and T-072 (PDF) extend this surface and will append their own gates.

- [ ] `/reports` renders without errors for an admin, operator, and viewer. The viewer can read (RLS allows SELECT on the views via the underlying tables' SELECT policies; mutations are still blocked).
- [ ] Default load (`/reports` with no query string) selects Revenue Summary for the current year. URL after first interaction reflects the selected report + year via `?report=…&year=…`.
- [ ] Year dropdown spans current year ± 3. Selecting a different year navigates without a full page reload (React `useTransition`).
- [ ] **Date range applicability:** the From/To inputs are enabled only for Revenue Summary and Pending Refunds. On the other four reports the inputs are visibly disabled and an "italic" note reads "Date range not applicable — this report is aggregated by year."
- [ ] **Revenue Summary** rows match `SELECT * FROM v_revenue_monthly WHERE year=$1 [AND month BETWEEN $from AND $to] ORDER BY month`. Totals row shows the sum of `consignment_count` and `formatTzs(sum(total_amount))`.
- [ ] **Client Volume** rows match `SELECT * FROM v_client_volume WHERE year=$1 ORDER BY total_containers DESC`. Totals row shows summed jobs, containers, and revenue. Empty `sub_label` cells render no second line (no stray "—").
- [ ] **Turnaround · by Client** rows are ordered `avg_days ASC` (fastest first). Released = 0 clients are excluded by the view's `WHERE release_status = 'Released'` filter.
- [ ] **Turnaround · by ICD** rows match `v_turnaround_by_icd` for the selected year. ICDs with zero released consignments do not appear.
- [ ] **Pipeline Bottleneck** lists all 10 Action stages from `v_pipeline_funnel` for the selected year. Each row shows the count and that stage's percentage of `total_active`. The footer shows `released` and `total_active` for the year.
- [ ] **Pending Refunds** rows match `v_pending_refunds` for the selected year, sorted by `release_date DESC`. Date range filter applies to `release_date`. Totals row shows summed `amount`. Empty state reads "✅ No pending refunds for this period."
- [ ] Every report has an explicit `EmptyRow` for "no rows match" and an `ErrorRow` for Supabase errors — no blank/silent tables.
- [ ] **RLS sanity (D-026):** `getSupabaseAdminClient` is not introduced anywhere under `src/app/(app)/reports/`. The admin-client allowlist stays at 3 sites.
- [ ] **Money formatting:** every shilling value uses `formatTzs` (not inline `Intl.NumberFormat`). Dates use `formatDate` (not raw ISO strings).
- [ ] **Filter persistence:** changing the report selector keeps the year + date range in the URL where applicable. Year-only reports preserve `from`/`to` in the URL (so flipping back to a date-aware report restores them) but do not act on them.
- [ ] **Generated types:** all six views are present in `Database['public']['Views']` of `src/types/supabase.ts`. No `as any` casts in the page file.
- [ ] **Defer-to-T-071/T-072:** the footer note explicitly mentions exports are pending. The acceptance for T-071/T-072 will move this note into proper UI buttons.

---

## V-REPORTS-XLSX — XLSX export (T-071)

Run after any change to `src/app/api/reports/[kind]/xlsx/route.ts`, `src/server/reports/`, or any T-024 view definition. Extends V-REPORTS.

- [ ] Each of the six reports on `/reports` has a visible **Export XLSX** anchor in its header. Clicking it triggers a browser download of `kdl-<kind>-<year>[-<from>-<to>].xlsx` with the correct `Content-Type` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) and a `Content-Disposition: attachment` header.
- [ ] Opening the downloaded file in Excel/LibreOffice: row 1 is the report title; row 2 is `Generated …` + filter summary; row 3 is blank; row 4 holds bolded headers; rows 5+ are data; freeze pane sits at row 4.
- [ ] **Money** columns (Revenue.`total_amount`, Client Volume.`total_revenue`, Pending Refunds.`amount`) are numeric cells with `numFmt = "TSh"#,##0` — sortable, summable, and right-aligned by Excel's default treatment. They are NOT pre-formatted strings.
- [ ] **Date** columns (Pending Refunds.`release_date`) are real `Date` cells with `numFmt = yyyy-mm-dd`. They sort chronologically, not lexically.
- [ ] **Totals row** is present on Revenue, Client Volume, Pipeline Bottleneck, and Pending Refunds — matching the page's `TotalRow`. Turnaround · by Client and Turnaround · by ICD intentionally have no totals row.
- [ ] **Empty result** (e.g. a year with no released consignments) downloads a valid workbook with the headers and a single sentinel cell `"No rows matched the filter."` at row 5. Not an error response.
- [ ] **Filter range** is honoured on the date-aware reports: `/api/reports/revenue/xlsx?year=2026&from=2026-01-01&to=2026-03-31` and `/api/reports/pending_refunds/xlsx?year=2026&from=2026-02-01&to=2026-02-28` download only the matching rows; row 2 records the range. Year-grain reports ignore `from`/`to` per D-039.
- [ ] **Auth gate.** `GET /api/reports/revenue/xlsx?year=2026` in an unauthenticated client returns `401`, not the workbook bytes. An authenticated viewer can download (RLS on the underlying views permits SELECT).
- [ ] **Bad kind.** `/api/reports/bogus/xlsx?year=2026` returns `400` with JSON `{"error":"Unknown report kind: bogus"}`.
- [ ] **Bad year.** Missing or non-numeric `year` falls back to the current year (matches the page's behavior); no `500`.
- [ ] **Sheet name** strips Excel-forbidden characters and middle-dot, caps at 31 chars. Verified by `__sheetNameFor` Vitest cases.
- [ ] **No SheetJS.** `grep -rn "from [\"']xlsx[\"']" src/app/api/ src/server/reports/ src/app/(app)/reports/` returns nothing. The writer is exceljs; SheetJS stays scoped to import-actions and the CLI script (D-035).
- [ ] **RLS sanity (D-026).** `grep -rn "getSupabaseAdminClient" src/app/api/reports/ src/server/reports/ src/app/(app)/reports/` is empty. Admin-client allowlist stays at 3 sites.
- [ ] **Tests.** `tests/unit/build-xlsx.test.ts` — 11/11 green. Total Vitest count ≥ 46.
- [ ] **Build.** `pnpm build` includes `/api/reports/[kind]/xlsx` in the route manifest under `ƒ` (server-rendered on demand).

---

## V-REPORTS-PDF — PDF export (T-072)

Run after any change to `src/app/api/reports/[kind]/pdf/route.ts`, `src/server/reports/build-pdf.tsx`, or any T-024 view definition. Extends V-REPORTS; mirrors V-REPORTS-XLSX.

- [ ] Each of the six reports on `/reports` has a visible **Export PDF** anchor next to the Export XLSX anchor. Clicking it triggers a browser download of `kdl-<kind>-<year>[-<from>-<to>].pdf` with `Content-Type: application/pdf` and `Content-Disposition: attachment`.
- [ ] Opening the downloaded PDF: A4 **landscape**; a fixed page header carries the **Kingdao logo** (`public/KINGDAO_LOGO.png`) on the left and the report title + `Generated … UTC` + filter summary on the right, repeated on every page; the footer shows `KDL Tracker` and a `page / total` counter.
- [ ] **Money** cells (Revenue.`total_amount`, Client Volume.`total_revenue`, Pending Refunds.`amount`) render via `formatTzs` — same formatting as the page and the XLSX strings.
- [ ] **Date** cells (Pending Refunds.`release_date`) render `yyyy-mm-dd`.
- [ ] **Totals row** present on Revenue, Client Volume, Pipeline Bottleneck, and Pending Refunds; absent on the two Turnaround reports — matching the page and the XLSX.
- [ ] **Pagination.** A report with enough rows to exceed one page splits across pages; the header + table header repeat on each page (react-pdf `fixed`); no row is clipped at a page boundary (`wrap={false}` on data rows).
- [ ] **Empty result** downloads a valid one-page PDF showing `"No rows matched the filter."` — not an error response.
- [ ] **Filter range** honoured on date-aware reports: `/api/reports/revenue/pdf?year=2026&from=2026-01-01&to=2026-03-31` and `/api/reports/pending_refunds/pdf?year=2026&from=2026-02-01&to=2026-02-28` render only matching rows; the header records the range. Year-grain reports ignore `from`/`to` per D-039.
- [ ] **Auth gate.** `GET /api/reports/revenue/pdf?year=2026` unauthenticated returns `401`. An authenticated viewer can download.
- [ ] **Bad kind.** `/api/reports/bogus/pdf?year=2026` returns `400` with JSON `{"error":"Unknown report kind: bogus"}`.
- [ ] **Bad year.** Missing/non-numeric `year` falls back to the current year; no `500`.
- [ ] **Node runtime.** The route exports `runtime = "nodejs"` — `@react-pdf/renderer` needs Node built-ins (`fs`, fontkit); Edge would fail.
- [ ] **Missing logo is non-fatal.** If `KINGDAO_LOGO.png` is absent at `process.cwd()`, the builder falls back to a blank logo box rather than throwing.
- [ ] **RLS sanity (D-026).** `grep -rn "getSupabaseAdminClient" src/app/api/reports/ src/server/reports/` is empty. Admin-client allowlist stays at 3 sites.
- [ ] **No SheetJS / no exceljs** in the PDF path — `build-pdf.tsx` imports only `@react-pdf/renderer` + `@/lib/money` + `./report-types`.
- [ ] **Tests.** `tests/unit/build-pdf.test.ts` — 9/9 green (each kind renders a valid `%PDF`; empty + null payloads do not throw).
- [ ] **Build.** `pnpm build` includes `/api/reports/[kind]/pdf` in the route manifest under `ƒ`.

---

## V-DEPLOY — Production deployment

- [ ] Migrations applied via `supabase db push`, never via Studio.
- [ ] Vercel preview URL works end-to-end before promoting to production.
- [ ] Production env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only), `RESEND_API_KEY`, `ALERTS_CRON_SECRET`.
- [ ] Legacy `anon` and `service_role` keys are **disabled** in the Supabase dashboard for both dev and prod.
- [ ] Admin can log in on production with a real invited account.
- [ ] Backup verified: Supabase daily backup setting enabled in dashboard.

---

## V-REFDATA — Reference-data management (ICDs / Vessels in Settings; Clients in `/clients`, D-050 / D-053)

- [ ] `/settings/icds`, `/settings/vessels` reachable as admin; each lists existing rows with an Active/Inactive badge. **`/settings/clients` no longer exists** (D-053) — no "Clients" entry in the Settings nav; navigating to `/settings/clients` 404s.
- [ ] Non-admin (operator/viewer) hitting any `/settings/*` route is redirected to `/` (inherited from `settings/layout.tsx`).
- [ ] Add / Edit / Activate-Deactivate work for ICDs & vessels; duplicate name returns a friendly "already exists" message (no raw `23505`).
- [ ] For ICDs/vessels, "Deactivate" is a reversible toggle — nothing is deleted; inactive rows still appear in Settings.
- [ ] **Clients (D-053):** the `/clients` left panel is the only client-management surface. As admin: search, `+ New`, per-row `⋯` → Edit (pre-filled, persists after refresh) and Delete all work. The `⋯` menu and `+ New` are hidden for non-admins.
- [ ] **Client delete guard:** deleting a client with **no** consignments soft-deletes it (drops from the list; if it was selected, the detail clears). Deleting a client **with** consignments is refused with "This client has N consignment(s) and cannot be deleted." — the consignments are untouched.
- [ ] Inactive clients/ICDs/vessels are **excluded** from the New / Edit consignment dropdowns + vessel datalist (`is_active = true` filter).
- [ ] Vessel field on New + Edit forms suggests managed vessel names via `<datalist>` but still accepts a brand-new free-text value (saves fine).
- [ ] Client dropdowns show `name — sub_label` so PAPA/JOYCE variants are distinguishable.
- [ ] Direct REST write to `vessels` (INSERT/UPDATE) with a non-admin JWT is rejected by RLS (`vessels_write_admin`).
- [ ] Editing a client/ICD/vessel writes an `audit_log` row (trigger `*_audit`).
- [ ] `grep -rn "getSupabaseAdminClient" src/` still returns only the 3 D-026 sites — the new server actions use the user-bound client.

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
