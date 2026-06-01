-- =============================================================================
-- audit_rls.sql — RLS coverage audit (T-081 security review deliverable)
-- =============================================================================
-- Read-only. Run against the dev (or prod) Supabase project to confirm the RLS
-- posture mandated by CLAUDE.md §3.2 ("Every table has RLS on") and §3.3
-- ("per-column permissions enforced ... on UPDATE").
--
-- HOW TO RUN:
--   Supabase Studio → SQL Editor → paste → Run, OR
--   psql "$DATABASE_URL" -f audit_rls.sql
--
-- EXPECTED RESULTS (as of 2026-05-31, 14 user-facing tables):
--   Query 1: rls_enabled = true for EVERY row. Any `false` is a finding.
--   Query 2: every user-facing table has the policies it should (see notes
--            inline). Tables intentionally missing a write policy (audit_log,
--            stage_history, stuck_alerts) are append-only / definer-written.
--   Query 3: NO operational table (consignments, efd_records, clients, icds)
--            should appear with a permissive DELETE policy — soft-delete only.
--            efd_records DELETE is admin-only by design (logged).
--   Query 4: the consignments per-column write guard trigger is present.
-- =============================================================================

-- ── Query 1: RLS enabled on every public table ───────────────────────────────
-- FAIL if any row shows rls_enabled = false.
select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  c.relforcerowsecurity                       as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'           -- ordinary tables only (excludes views)
order by c.relrowsecurity asc,  -- surface any `false` at the top
         c.relname;

-- ── Query 2: policy coverage per table, by command ───────────────────────────
-- One row per table; aggregates which commands have at least one policy.
-- `cmd` values: r=SELECT, a=INSERT, w=UPDATE, d=DELETE, *=ALL.
select
  pol.schemaname,
  pol.tablename,
  string_agg(distinct pol.cmd, ', ' order by pol.cmd) as commands_with_policy,
  count(*)                                            as policy_count
from pg_policies pol
where pol.schemaname = 'public'
group by pol.schemaname, pol.tablename
order by pol.tablename;

-- ── Query 2b: full policy listing (for eyeballing the USING / WITH CHECK) ─────
select
  tablename,
  policyname,
  cmd,
  roles,
  qual          as using_expr,
  with_check    as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- ── Query 3: hard-DELETE exposure on operational tables ──────────────────────
-- Soft-delete only (CLAUDE.md §3.5). Expect: NO rows for clients/icds/consignments;
-- efd_records may show an admin-only DELETE policy (documented exception).
select
  tablename,
  policyname,
  roles,
  qual as using_expr
from pg_policies
where schemaname = 'public'
  and cmd in ('DELETE', 'ALL')
  and tablename in ('consignments', 'efd_records', 'clients', 'icds')
order by tablename;

-- ── Query 4: per-column write guard present on consignments (T-081 / D-046) ───
-- Expect exactly one BEFORE UPDATE trigger calling consignments_enforce_column_write.
select
  t.tgname                                        as trigger_name,
  pg_get_triggerdef(t.oid)                        as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'consignments'
  and not t.tgisinternal
order by t.tgname;

-- ── Query 5: SECURITY DEFINER functions that mutate (caller-gate sanity) ──────
-- For each, confirm (by reading the body) it has a caller-role / admin gate
-- (D-029). Pure helpers (is_admin, can_user_*) are read-only and exempt.
select
  p.proname                                       as function_name,
  pg_get_function_identity_arguments(p.oid)       as args,
  p.prosecdef                                     as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
