-- =============================================================================
-- D-057: enable Supabase Realtime on consignments + efd_records
-- =============================================================================
-- The app subscribes to postgres_changes on these two tables and merges events
-- into the TanStack Query cache via setQueryData (CLAUDE.md §3.7) so multi-user
-- changes appear live without a refetch storm.
--
-- Two things are required for usable Realtime payloads:
--   1. The table must be a member of the `supabase_realtime` publication.
--   2. `replica identity full` so UPDATE events carry the full OLD row (not just
--      the primary key) — needed to diff/patch cached rows on the client.
--
-- RLS is unchanged: Realtime respects the existing SELECT policies, so a client
-- only receives change events for rows it is already allowed to read.
-- Created via the Supabase CLI (never Studio), per D-007 / D-019.
-- =============================================================================

alter publication supabase_realtime add table public.consignments;
alter publication supabase_realtime add table public.efd_records;

alter table public.consignments replica identity full;
alter table public.efd_records  replica identity full;
