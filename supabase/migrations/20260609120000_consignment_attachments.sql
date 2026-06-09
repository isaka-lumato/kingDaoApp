-- =============================================================================
-- T-089 / D-054: consignment attachments (private Storage bucket + metadata)
-- =============================================================================
-- Bytes live in a PRIVATE bucket `consignment-attachments`; this table holds the
-- metadata + object path. Downloads are served via short-lived signed URLs.
-- Soft-delete only (D-015). Reuses the shared set_updated_at() + log_table_change()
-- helpers (20260518175744). RLS mirrors the consignments role pattern
-- (20260519005000): SELECT viewer+ (deleted rows admin-only), INSERT operator+admin,
-- UPDATE admin-only (soft-delete is the only sanctioned update).
--
-- Bucket + storage.objects policies are created here (SQL migration), not via the
-- Studio UI, per D-007 / D-019 (Studio is read-only for schema).
-- =============================================================================

-- ─── 1. Metadata table ──────────────────────────────────────────────────────
create table public.attachments (
  id              uuid        primary key default gen_random_uuid(),
  consignment_id  uuid        not null references public.consignments(id) on delete cascade,
  storage_path    text        not null unique,
  file_name       text        not null,
  mime_type       text        not null,
  size_bytes      bigint      not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by     uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
-- `on delete cascade` is a hard-delete safety net only; the app deletes softly (D-015).

comment on table public.attachments is
  'Files attached to a consignment. Bytes live in the private bucket consignment-attachments; this row is metadata + object path. Soft-delete only. T-089 / D-054.';

-- ─── 2. Indexes ─────────────────────────────────────────────────────────────
create index attachments_consignment_idx
  on public.attachments (consignment_id, created_at desc)
  where deleted_at is null;

-- ─── 3. Triggers (shared helpers — mirror vessels/consignments) ──────────────
create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

create trigger attachments_audit
  after insert or update or delete on public.attachments
  for each row execute function public.log_table_change();

-- ─── 4. RLS on the metadata table ────────────────────────────────────────────
alter table public.attachments enable row level security;

-- SELECT: any authenticated user (viewer+) reads non-deleted rows; admins also
-- see soft-deleted rows.
create policy attachments_select
  on public.attachments for select to authenticated
  using (deleted_at is null or public.is_admin());

-- INSERT: operators and admins (the roles that can write consignments).
create policy attachments_insert
  on public.attachments for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.name in ('admin', 'operator')
    )
  );

-- UPDATE: admin only. Soft-delete (set deleted_at) is the only sanctioned update.
create policy attachments_update
  on public.attachments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy → hard delete is blocked for everyone (soft-delete only).

-- ─── 5. Private Storage bucket ───────────────────────────────────────────────
-- file_size_limit + allowed_mime_types are enforced by Storage against the real
-- bytes — the un-bypassable guard (the app's client-side checks are spoofable).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consignment-attachments',
  'consignment-attachments',
  false,
  10485760,  -- 10 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- ─── 6. storage.objects RLS — scoped to the consignments/ prefix ─────────────
-- Path convention: consignments/<consignmentId>/<uuid>-<filename>

-- READ: any authenticated user (viewer+). Downloads go through short-lived signed
-- URLs minted server-side, but the SELECT policy still gates the object listing.
create policy "consignment_attachments_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'consignment-attachments'
    and (storage.foldername(name))[1] = 'consignments'
  );

-- INSERT (upload): operators and admins, mirroring attachments_insert.
create policy "consignment_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'consignment-attachments'
    and (storage.foldername(name))[1] = 'consignments'
    and (
      public.is_admin()
      or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = (select auth.uid())
          and r.name in ('admin', 'operator')
      )
    )
  );

-- DELETE: admin OR the original uploader. The uploader path lets the client's
-- best-effort orphan-cleanup succeed when a metadata insert fails right after an
-- upload, without granting blanket delete rights to operators.
create policy "consignment_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'consignment-attachments'
    and (storage.foldername(name))[1] = 'consignments'
    and (public.is_admin() or owner = (select auth.uid()))
  );

-- No UPDATE policy on storage.objects → objects are immutable once written.
