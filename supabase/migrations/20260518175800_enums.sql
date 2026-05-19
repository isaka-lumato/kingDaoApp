-- =============================================================================
-- Enums: container types and the 10 pipeline status enums
-- =============================================================================
-- Per PRD §13.3. Each pipeline stage has its own enum because the allowed
-- values differ (some have Done/Paid/Released/Uploaded/Closed/SHARED, etc.).

create type public.container_type as enum (
  '40FT', '20FT', 'CAR', 'COIL'
);

create type public.manifest_status as enum (
  'Waiting', 'Action', 'Uploaded'
);

create type public.shipping_batch_status as enum (
  'Waiting', 'Action', 'PREPARED', 'W/CARRY IN', 'CARRY IN END', 'Done'
);

create type public.tanesws_status as enum (
  'Waiting', 'Action', 'Done'
);

create type public.assessment_status as enum (
  'Waiting', 'Action', 'Closed'
);

create type public.tbs_loading_status as enum (
  'Waiting', 'Action', 'Done'
);

create type public.tbs_debit_status as enum (
  'Waiting', 'Action', 'Paid', 'SHARED'
);

create type public.manifest_comp_status as enum (
  'Waiting', 'Action', 'Done'
);

create type public.duty_status as enum (
  'Waiting', 'Action', 'Paid'
);

create type public.inspection_file_status as enum (
  'Waiting', 'Action', 'Done', 'SHARED'
);

create type public.release_status as enum (
  'Waiting', 'Released'
);

-- Logical identifiers for the 10 pipeline stages — used as parameter values
-- for advance_stage(consignment_id, stage, new_value, ...).
create type public.pipeline_stage as enum (
  'manifest',
  'shipping_batch',
  'tanesws',
  'assessment',
  'tbs_loading',
  'tbs_debit',
  'manifest_comp',
  'duty',
  'inspection_file',
  'release'
);
