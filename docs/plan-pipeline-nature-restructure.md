# Plan — Pipeline Restructure: New-Consignments column, drop-popups, Consignment Nature & skip logic

> **Status:** ~95% IMPLEMENTED (uncommitted on `trial`) as of 2026-07-17. Created 2026-07-13.
> **Owner:** Baraka / next AI session.
> **Scope:** Non-PRD design change. **NOTE the decision number:** the code + migrations currently cite **D-070**, but D-070 in `decisions.md` is already the Roles UI decision — this restructure must be renumbered to **D-071** and all "D-070" citations in the nature/intake code + migrations fixed.
> **This file is self-contained** so any session (or another AI tool) can resume without re-deriving context. Read it top-to-bottom, then work the RESUME checklist immediately below.

---

## RESUME STATE (2026-07-17) — what's done vs. what's left

**Already built (uncommitted, in git working tree on `trial`):**
- ✅ Migrations `20260713120000` (nature enum + `consignment_nature`, `estimated_arrival_date`, `ucr_no` columns + per-column perm seed) and `20260713120500` (`advance_stage()` with `p_extra` intake gate + Transit/Export TBS skip, no duty auto-pay). `src/types/supabase.ts` regenerated.
- ✅ `src/lib/pipeline.ts`: Duty Application (`tanesws`) reordered before Shipping Batch; nature-aware `resolveActiveStage`; `isNewConsignment()`, `gatedPopupForForwardMove()`, `NEW_COLUMN_ID`.
- ✅ Minimal create form (`new-consignment-form.tsx`) + relaxed `create-consignment.ts` schema (nature required, estimated arrival, tansad/icd removed).
- ✅ Kanban board: New Consignments column, blocking drop-popups wired via `pendingGate` (`kanban-board.tsx`); `intake-dialog.tsx` (Manifest = arrival+ICD; Duty App = TANSAD+UCR).
- ✅ Mobile tap-to-advance gates (`stage-action-menu.tsx`).
- ✅ Edit + detail surfaces expose nature / estimated arrival / UCR.
- ✅ `advanceStageAction` passes `p_extra` (`consignments.ts`); zod-validated.

**LEFT TO DO:**
1. ❓ Resolve OPEN QUESTIONS (§8, esp. OQ-1 "Ref No" — a Ref No field is NOT in the duty popup yet).
2. ⬜ Log **D-071** in `decisions.md`; fix every "D-070" citation in the nature/intake code + the two migration file headers to "D-071".
3. ⬜ Confirm both migrations were APPLIED to `kdl-tracker-dev` (unverified this session).
4. ⬜ Consider renaming to avoid two "Duty…" columns ("Duty Application" vs "Duty").
5. ⬜ Gates: `pnpm typecheck` / `pnpm lint` / `pnpm test`.
6. ⬜ Add **V-NATURE** to `validation.md`; run it against dev.
7. ⬜ Manual QA the full flow (create → New → Manifest popup → Duty popup → Transit skip → duty still Waiting).
8. ⬜ Update `status.md` + `tasks.md`; conventional-commit (no `--no-verify`).

---

## 0. Why this exists (the ask, in one paragraph)

The pipeline currently starts at "Manifest Uploaded". We're adding a **"New Consignments"** intake bucket before it: creating a consignment now captures only lightweight, known-at-intake data. Real-world data that is only discovered *once processing starts* is captured at the moment a card is dragged into the stage that needs it, via **blocking drop-popups**. We also add a **Consignment Nature** (Import / Export / Transit) that drives a **skip** of the TBS stages for Transit/Export, and we **reorder Duty Application before Shipping Batch**.

---

## 1. Decisions locked with the user (2026-07-13)

| # | Question | Decision |
|---|---|---|
| 1 | Which stages does Transit/Export skip? | **TBS Applications (`tbs_loading`) + TBS Debit (`tbs_debit`)**. |
| 2 | How is the skip performed? | **Auto-skip on advance, enforced in the DB** (`advance_stage()` marks the skipped stages Done with a `stage_history` note). Card visually jumps the skipped columns. |
| 3 | Popup timing? | **Blocking** — the drop opens the popup; the card only moves after the required fields are saved. Cancel = card stays put. |
| 4 | Duty-App popup fields? | **`ucr_no` is the only new column.** Tansad moves from the create form into this popup. (See Open Question OQ-1 re: "Ref No".) |

Derived design choices (mine, flagged for review):

- **D-a — "New Consignments" is a derived bucket, not a new enum value.** A card is "New" while `manifest_status = 'Waiting'` **and** `arrival_date IS NULL`. It leaves the bucket when the Manifest drop-popup sets the actual arrival + ICD and bumps `manifest_status` → `Action`. No new pipeline enum, no state-machine value added.
- **D-b — Estimated vs actual arrival are two columns.** Add `estimated_arrival_date` (set at creation). Keep `arrival_date` as the **actual** arrival, set at the Manifest drop-popup. This preserves `classifyConsignment`'s "no `arrival_date` ⇒ forced Waiting" rule (PRD §7.2) and `advance_stage()` §8.1 ("`arrival_date` required before terminal states").
- **D-c — Skip does NOT trigger the duty auto-propagation.** `advance_stage()` today auto-sets `duty_status = 'Paid'` when `tbs_debit` becomes `Paid`/`SHARED`. The Transit/Export *skip* path must mark `tbs_debit` done **without** paying duty — duty is a separate real step. Skip writes the TBS stages' done values directly, bypassing the propagation branch.
- **D-d — Reordering is an app-layer change.** Stage order lives in `PIPELINE_STAGES` (`src/lib/pipeline.ts`), not the DB enum. Moving `tanesws` before `shipping_batch` is a reorder of that array + verifying no `advance_stage()` prerequisite depends on the old order (it doesn't — see §4).
- **D-e — Historical/imported rows default to `Import`.** Full pipeline, no skip, so nothing existing changes behaviour.

---

## 2. New stage order (visual board, left→right)

```
[New Consignments]   ← derived bucket: manifest_status='Waiting' AND arrival_date IS NULL
  → Manifest Uploaded          (manifest_status)          [DROP-POPUP A: arrival + ICD]
  → Duty Application           (tanesws_status)  ← MOVED UP  [DROP-POPUP B: (ref) + tansad + ucr]
  → Shipping Batch             (shipping_batch_status)
  → Assessment                 (assessment_status)
  → TBS Applications           (tbs_loading_status)   ← SKIPPED for Transit/Export
  → TBS Debit                  (tbs_debit_status)     ← SKIPPED for Transit/Export
  → Manifest Comparison        (manifest_comp_status)
  → Duty                       (duty_status)
  → Inspection File            (inspection_file_status)
  → Release                    (release_status)
```

Only change vs current order: `tanesws` (Duty Application) moves from position 3 to position 2 (right after `manifest`). Everything else keeps its relative order.

**Prerequisite safety check (verified against `20260519005500_advance_stage.sql`):**
- `tanesws → Done` requires `manifest_status = Uploaded` — still satisfied (manifest is still before tanesws). ✅
- `shipping_batch` has **no** prerequisite in `advance_stage()`, so putting it after tanesws is free. ✅
- All other hard prereqs (`tbs_loading`←assessment, `tbs_debit`←tbs_loading, `inspection_file`←duty, `release`←inspection_file) are unaffected by the reorder. ✅

---

## 3. Schema changes (one new migration)

New migration, e.g. `supabase/migrations/2026071X_consignment_nature_and_intake.sql`:

1. **Enum** `public.consignment_nature as enum ('Import','Export','Transit')`.
2. **Column** `consignments.consignment_nature public.consignment_nature not null default 'Import'`.
3. **Column** `consignments.estimated_arrival_date date` (nullable).
4. **Column** `consignments.ucr_no text` (nullable).
5. **Per-column write permissions seed** (D-004 / D-046): add `role_column_permissions` rows for the 3 new columns so operators can write them and the `consignments_enforce_column_write()` guard (migration `...090000`) doesn't reject the popup writes with `42501`. Mirror the existing seed for `arrival_date` / `icd_id` / `tansad_no`.
6. Regenerate types: `pnpm gen:types:dev` → `src/types/supabase.ts`.

> Per CLAUDE.md §7 / D-007: migrations via Supabase CLI only, never Studio. Apply to `kdl-tracker-dev` first. **NOTE the standing debt H-014 (status.md 2026-07-04):** the live dev DB was previously hand-edited in Studio and no migration reproduces the cargo rename — a fresh `db reset` rebuilds the OLD schema. Confirm this migration applies cleanly on top of the drift, or fold the owed rename migration in first.

---

## 4. `advance_stage()` changes (the load-bearing DB work)

Edit `advance_stage()` (new migration; use `create or replace function`). Four changes:

1. **Fix pre-existing drift (fold-in, flagged):** line ~59 checks `assessment_status <> 'Closed'`, but the live enum + app use **`'Accepted'`** (migration `...20260702180410`, D-059). Change `'Closed'` → `'Accepted'`. Also line ~91's terminal-value list includes `'Closed'` — update to `'Accepted'`. *This is a latent bug the reorder work touches anyway; fixing it here is deliberate, not silent.*

2. **Extra intake columns via an optional `p_extra jsonb` param** (recommended) — `advance_stage(p_id, p_stage, p_new_value, p_reason default null, p_extra jsonb default null)`. When `p_extra` is present, whitelist-write only the allowed keys in the same transaction (so the popup write + stage advance are atomic and use the existing GUC bypass so the column guard doesn't fight it):
   - Manifest gate: `arrival_date`, `icd_id`.
   - Duty-App gate: `tansad_no`, `ucr_no` (and `ref_no` iff OQ-1 resolves to "editable").
   - Reject any key not in the whitelist. Keep the whitelist in the SQL function — DB is source of truth.
   - *Alternative considered:* two dedicated RPCs (`enter_manifest`, `enter_duty_application`). Rejected as more surface for the same effect; the `p_extra` param keeps one sanctioned mutation path (D-009).

3. **Skip logic for Transit/Export** — after applying a stage change, if `v_c.consignment_nature in ('Export','Transit')` and the recomputed active stage would be `tbs_loading`, cascade-skip:
   - Set `tbs_loading_status` → `'Done'` and `tbs_debit_status` → `'Paid'` **directly** (do NOT go through the `tbs_debit='Paid'` branch that auto-pays duty — see D-c).
   - Write two `stage_history` rows with `reason = 'skipped (nature=' || nature || ')'`, `is_forced = false`.
   - Net effect: advancing out of Assessment lands the card in Manifest Comparison, skipping both TBS columns.
   - Implement this as a helper block at the end of the apply-case, or a small internal `perform` — keep it readable (CLAUDE.md §3.8, no premature abstraction).

4. Re-emit the companion `20260525090000` column-guard bypass if the function body changed materially (it re-declares the GUC dance — copy the existing pattern verbatim).

---

## 5. Client / app-layer changes

### 5.1 `src/lib/pipeline.ts`
- Reorder `PIPELINE_STAGES`: move the `tanesws` entry to index 1 (after `manifest`).
- Add `consignment_nature` to `KanbanConsignment` and `ClassifiableRow`.
- Add a **nature-aware active-stage resolver.** `resolveActiveStage` must skip `tbs_loading`/`tbs_debit` when nature is Export/Transit so the optimistic landing column + bucket match the DB. Options: pass nature in, or add `resolveActiveStageForNature(row, nature)`. The current `resolveActiveStage(Record<string,string>)` is called in several places (`consignments.ts`, kanban board optimistic move, `currentStageLabel`, `classifyConsignment`) — thread nature through or default to Import when absent. **Grep for all callers before changing the signature.**
- Add the "New Consignments" pseudo-stage concept for the board only (not a `StageField`): a card is New when `manifest_status==='Waiting' && !arrival_date`. Board rendering (§5.3) special-cases this; `resolveActiveStage` still returns `manifest_status` for these rows.

### 5.2 New-consignment form + action
- **`new-consignment-form.tsx`:** minimal fields only — Client, Goods description, Remarks, B/L Number, Vessel Name, **Estimated arrival date**, Cargo count, Cargo type, **Consignment Nature** (new `<select>`: Import/Export/Transit). Remove from create: exact arrival, ICD, TANSAD, amount, EFD receipt (these move to popups / edit page). Keep the client/vessel "+ Add new" modals as-is.
- **`create-consignment.ts`:** relax the zod schema — `tansad_no`, `icd_id` become optional; replace `arrival_date` with `estimated_arrival_date`; add required `consignment_nature` enum. Insert with `arrival_date = null`, `icd_id = null`, `tansad_no = null`, `estimated_arrival_date = <input>`, `consignment_nature = <input>`. All stages still start `Waiting`. `ref_no`/`serial_no` auto-gen unchanged (D-028).

### 5.3 Kanban board (`kanban-board.tsx` + column/card)
- Render an extra **"New Consignments"** column at the far left, populated from the New-bucket predicate (§5.1). It's presentational — cards there have `active_stage === 'manifest_status'` but are separated out.
- **Drop-popup wiring (blocking):** `handleDragEnd` currently fires `applyOptimistic` + `advanceStageAction` immediately. Introduce a gate check:
  - If the drop is **New → Manifest** → open **Popup A** (arrival + ICD). Do NOT advance yet. On submit: call the advance with `p_extra = {arrival_date, icd_id}` and `manifest_status → 'Action'`; then optimistic move. On cancel: revert (card stays in New).
  - If the forward drag's computed landing stage is **`tanesws` (Duty Application)** → open **Popup B** ((ref) + tansad + ucr). On submit: advance manifest → `Uploaded` with `p_extra = {tansad_no, ucr_no}`; card lands in Duty App. On cancel: revert.
  - All other forward/backward drags: unchanged.
- Because popups defer the mutation, the optimistic `applyMove` must fire *after* popup submit, not on drop. Restructure `handleDragEnd` to set a pending-popup state `{card, kind, landingStage}` instead of calling the action directly for gated transitions.
- `stage-action-menu.tsx` (mobile/triage tap-to-advance, D-034/D-045) needs the same gates — dragging isn't the only path. Factor the "does this transition need a popup?" decision into a shared helper in `lib/pipeline.ts` so board + action-menu agree.

### 5.4 New components
- `ManifestEntryDialog` (Popup A): actual arrival date (required) + ICD select (required, reuse the ICD list + "add new" pattern from the form).
- `DutyApplicationDialog` (Popup B): Tansad No (required?), UCR No (required?), and the Ref No field per OQ-1. Confirm required-ness with user at build time.
- Model both on the existing `force-stage-dialog.tsx` pattern for consistency.

### 5.5 Server action for gated advance
- Extend `advanceStageAction` (or add `advanceStageWithDataAction`) to accept the extra payload and pass `p_extra` to the RPC. Validate the payload with zod (arrival is a date, icd_id/uuid, tansad/ucr strings, length caps). Keep it in `src/server/actions/consignments.ts`.

### 5.6 Import parser
- `src/server/import/parse-tracker.ts`: default `consignment_nature = 'Import'` for every imported row (D-e). One field add; no header needed unless the tracker gains a Nature column later. `estimated_arrival_date` stays null on import (historical rows have actual arrival). `ucr_no` null unless a column exists.

### 5.7 Detail / edit / list surfaces
- **Edit page** (`consignments/[id]/edit`): surface `consignment_nature`, `estimated_arrival_date`, `ucr_no`, and keep `arrival_date`/`icd_id`/`tansad_no` editable (for corrections). Respect column permissions.
- **Detail view:** show Nature badge, estimated vs actual arrival, UCR.
- **Consignments list + exports** (`list-query.ts`, `export-columns.ts`, build-xlsx/pdf): add columns as desired (at least Nature). Optional for v1 of this feature — flag which the user wants.

---

## 6. Migrations checklist (in order)
1. `2026071X_consignment_nature_and_intake.sql` — enum + 3 columns + per-column perm seed.
2. `2026071X_advance_stage_nature_and_intake.sql` — `create or replace advance_stage()` with: assessment `'Closed'→'Accepted'` fix, `p_extra jsonb` whitelist writes, Transit/Export TBS skip (no duty propagation), column-guard GUC bypass re-emitted.
3. `pnpm gen:types:dev` after each.

---

## 7. Validation (add to `validation.md` as V-NATURE)
- New consignment created with only the minimal fields lands in **New Consignments** (manifest Waiting, no arrival).
- Drag New → Manifest **without** submitting Popup A ⇒ card does not move; DB unchanged.
- Submit Popup A ⇒ `arrival_date` + `icd_id` set, `manifest_status='Action'`, card in Manifest column.
- Advancing manifest → opens Popup B; submit sets `tansad_no`+`ucr_no`, `manifest_status='Uploaded'`, card in **Duty Application** (which sits before Shipping Batch).
- **Import** nature: card visits TBS Applications + TBS Debit columns normally.
- **Transit / Export** nature: advancing out of Assessment auto-skips both TBS columns (2 `stage_history` rows `reason='skipped (nature=…)'`), lands in Manifest Comparison, and `duty_status` is **still `Waiting`** (skip did not auto-pay duty).
- DB-side: operator direct REST `advance_stage` with `p_extra` writing a non-whitelisted key ⇒ rejected.
- Column-guard: operator can write the 3 new columns via the popup (no `42501`).
- Reorder didn't break prereqs: `tanesws→Done` still requires `manifest=Uploaded`.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean.

---

## 8. Open questions (resolve before/at implementation)
- **OQ-1 — "Ref No" in the Duty-Application popup.** The internal `ref_no` is auto-generated & unique-per-year (D-028) and used as a key; it can't be blank until the Duty stage. Three readings:
  1. The popup **displays** the internal `ref_no` read-only (so the operator copies it into TANCIS) and only Tansad+UCR are editable. **← recommended, least disruptive, matches selected answer "only UCR is new".**
  2. "Ref No" is a **distinct customs/declaration reference** → then it's a *fourth* new column, not the internal ref_no. Contradicts the "only UCR is new" answer.
  3. `ref_no` becomes operator-entered at Duty stage → large change (unique-index timing, D-028 reversal). Not recommended.
  Confirm with user; default to reading #1.
- **OQ-2 — Required-ness of Tansad/UCR in Popup B.** Can a card enter Duty Application with a blank UCR (filled later), or is UCR hard-required to advance? Assume Tansad required, UCR optional unless told otherwise.
- **OQ-3 — Does Duty (`duty_status`) also skip for Transit/Export?** User only named TBS. Assume **no** (duty still runs). Flag if transit goods never pay duty in their workflow.
- **OQ-4 — List/export columns.** Which of Nature / estimated-arrival / UCR should appear in the `/consignments` grid and XLSX/PDF exports?

---

## 9. Task breakdown (work top-down; check off as you go)

**Phase A — Groundwork & records**
- [ ] A1. Append **D-070** to `decisions.md` (this restructure; link the 4 locked decisions + D-a…D-e).
- [ ] A2. Add tasks to `tasks.md` (mirror B/C/D below) and a `status.md` "in progress" note.
- [ ] A3. Resolve **OQ-1** with the user (Ref No semantics).

**Phase B — Database**
- [ ] B1. Migration: `consignment_nature` enum + column (default 'Import').
- [ ] B2. Migration: `estimated_arrival_date`, `ucr_no` columns.
- [ ] B3. Migration: `role_column_permissions` seed for the 3 new columns (operators writable).
- [ ] B4. Migration: `create or replace advance_stage()` — assessment `Closed→Accepted` fix.
- [ ] B5. Same migration: `p_extra jsonb` whitelist writes (manifest & duty gates).
- [ ] B6. Same migration: Transit/Export TBS skip (no duty auto-pay) + `stage_history` notes.
- [ ] B7. Apply to `kdl-tracker-dev`; `pnpm gen:types:dev`; verify `advance_stage` signature + skip via SQL.

**Phase C — App: create + resolve**
- [ ] C1. `lib/pipeline.ts`: reorder `PIPELINE_STAGES`; add `consignment_nature` to types; nature-aware `resolveActiveStage` (grep all callers first); add `isGatedTransition()` helper + New-bucket predicate.
- [ ] C2. `create-consignment.ts`: relax schema (tansad/icd optional, estimated arrival, nature required); insert accordingly.
- [ ] C3. `new-consignment-form.tsx`: strip to minimal fields + add Nature dropdown; remove ICD/exact-arrival/tansad/amount/efd inputs.
- [ ] C4. `parse-tracker.ts`: default nature = Import on import.

**Phase D — App: board, popups, action menu**
- [ ] D1. `kanban-board.tsx`: render New Consignments column; refactor `handleDragEnd` to defer mutation for gated transitions.
- [ ] D2. `ManifestEntryDialog` (Popup A: arrival + ICD).
- [ ] D3. `DutyApplicationDialog` (Popup B: (ref) + tansad + ucr per OQ-1).
- [ ] D4. `consignments.ts`: gated `advanceStageAction` passing `p_extra`; zod-validate payload.
- [ ] D5. `stage-action-menu.tsx`: apply the same gates for tap-to-advance (mobile/triage).
- [ ] D6. Edit/detail: expose nature, estimated arrival, UCR (respect column perms).
- [ ] D7. (Optional, per OQ-4) list + export columns.

**Phase E — Verify & document**
- [ ] E1. Add **V-NATURE** to `validation.md`; run the checklist against dev.
- [ ] E2. Gates green (`typecheck`/`lint`/`test`); update `status.md` + check off `tasks.md`.
- [ ] E3. Conventional-commit on the `trial` branch (no `--no-verify`, CLAUDE.md §7).

---

## 10. Files touched (quick index for the next session)
- DB: `supabase/migrations/2026071X_*.sql` (×2), `src/types/supabase.ts` (regenerated).
- Core: `src/lib/pipeline.ts`, `src/server/actions/consignments.ts`, `src/server/actions/create-consignment.ts`.
- Import: `src/server/import/parse-tracker.ts` (+ `import-actions.ts` if a Nature column is added to the sheet later).
- Board: `src/app/(app)/kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx`, `home-shell.tsx`.
- Popups: new dialog components under `src/components/` (model on `force-stage-dialog.tsx`).
- Forms: `src/app/(app)/consignments/new/new-consignment-form.tsx` + `page.tsx`.
- Menu: `src/components/stage-action-menu.tsx`.
- Edit/detail: `src/app/(app)/consignments/[id]/edit/*`, `consignment-detail.tsx`.
- Docs: `decisions.md` (D-070), `tasks.md`, `status.md`, `validation.md` (V-NATURE).
