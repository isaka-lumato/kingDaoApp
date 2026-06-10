-- Widen consignments.amount from integer to bigint.
--
-- The column was created as `integer` (max 2,147,483,647 ≈ 2.1B TZS), which
-- silently capped large service fees and surfaced as a generic save error.
-- D-017 and src/lib/money.ts both state amounts are stored as bigint whole
-- shillings, so `integer` was an inconsistency, not a deliberate limit. This
-- aligns the column with its documented design and removes the practical cap.
--
-- Safe: widening integer -> bigint preserves all existing values. The
-- non-negative CHECK constraint is unaffected. Views using sum(amount) already
-- return bigint, so no downstream type change is needed.

alter table public.consignments
  alter column amount type bigint using amount::bigint;

comment on column public.consignments.amount is
  'Service fee in TZS, whole shillings (bigint per D-017). NULL until quoted. Soft range validated by app layer per PRD §7.3.';
