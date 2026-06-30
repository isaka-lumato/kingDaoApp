-- =============================================================================
-- T-089 / D-055: folder-based file system per consignment
-- =============================================================================
-- Evolves the flat attachments feature (T-089-orig / D-054-cited; canonical
-- record is now D-055) into a free-form folder tree:
--   * new table `consignment_folders` (self-referencing parent_folder_id)
--   * `attachments.folder_id` -> consignment_folders(id), NULL = consignment root
--   * widen the bucket's allowed_mime_types for doc/docx/txt/xls/xlsx
--
-- Reuses the shared set_updated_at() + log_table_change() helpers
-- (20260518175744). RLS mirrors the attachments table (20260609120000):
-- SELECT viewer+ (deleted rows admin-only), INSERT operator+admin,
-- UPDATE admin-only (rename + soft-delete are the only sanctioned updates).
-- Soft-delete only (D-015). Studio is read-only for schema (D-007/D-019).
-- =============================================================================

-- ─── 1. Folders table ────────────────────────────────────────────────────────
create table public.consignment_folders (
  id                uuid        primary key default gen_random_uuid(),
  consignment_id    uuid        not null references public.consignments(id) on delete cascade,
  parent_folder_id  uuid        references public.consignment_folders(id) on delete cascade,
  name              text        not null check (char_length(trim(name)) between 1 and 120),
  uploaded_by       uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
-- `on delete cascade` (both FKs) is a hard-delete safety net only; the app
-- deletes softly (D-015), cascading deleted_at down the subtree in the action.

comment on table public.consignment_folders is
  'Free-form folder tree per consignment. parent_folder_id NULL = top-level. Bytes live in attachments/Storage; this is structure only. Soft-delete only. T-089 / D-055.';

-- No two live folders with the same name under the same parent of the same
-- consignment. A soft-deleted folder frees its name for reuse (deleted_at in key).
-- COALESCE the nullable parent to a sentinel UUID so root-level siblings
-- (parent_folder_id IS NULL) are also covered by the uniqueness rule — a plain
-- multi-column unique index treats NULLs as distinct and would not.
create unique index consignment_folders_unique_name
  on public.consignment_folders (
    consignment_id,
    coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name
  )
  where deleted_at is null;

-- ─── 2. Indexes ──────────────────────────────────────────────────────────────
create index consignment_folders_consignment_idx
  on public.consignment_folders (consignment_id, created_at)
  where deleted_at is null;

create index consignment_folders_parent_idx
  on public.consignment_folders (parent_folder_id)
  where deleted_at is null;

-- ─── 3. Triggers (shared helpers — mirror attachments) ───────────────────────
create trigger consignment_folders_set_updated_at
  before update on public.consignment_folders
  for each row execute function public.set_updated_at();

create trigger consignment_folders_audit
  after insert or update or delete on public.consignment_folders
  for each row execute function public.log_table_change();

-- ─── 4. RLS on the folders table (mirrors attachments) ───────────────────────
alter table public.consignment_folders enable row level security;

-- SELECT: any authenticated user (viewer+) reads non-deleted rows; admins also
-- see soft-deleted rows.
create policy consignment_folders_select
  on public.consignment_folders for select to authenticated
  using (deleted_at is null or public.is_admin());

-- INSERT: operators and admins (the roles that can write consignments).
create policy consignment_folders_insert
  on public.consignment_folders for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.name in ('admin', 'operator')
    )
  );

-- UPDATE: admin only. Rename + soft-delete (set deleted_at) are the only
-- sanctioned updates.
create policy consignment_folders_update
  on public.consignment_folders for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy → hard delete is blocked for everyone (soft-delete only).

-- ─── 5. Link attachments to folders ──────────────────────────────────────────
-- Nullable: NULL = the consignment's root folder. Existing rows stay valid with
-- no backfill. on delete set null so a hard-deleted folder (safety net) leaves
-- its files at root rather than orphaning the FK.
alter table public.attachments
  add column folder_id uuid references public.consignment_folders(id) on delete set null;

comment on column public.attachments.folder_id is
  'Folder this file lives in (consignment_folders.id). NULL = consignment root. D-055.';

create index attachments_folder_idx
  on public.attachments (folder_id)
  where deleted_at is null;

-- ─── 6. Widen the bucket's allowed MIME types (D-055 §5) ─────────────────────
-- file_size_limit + allowed_mime_types are enforced by Storage against the real
-- bytes — the un-bypassable guard. Adds Word, plain text, and Excel to the
-- original images + PDF set. 10 MiB cap unchanged.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'consignment-attachments';
