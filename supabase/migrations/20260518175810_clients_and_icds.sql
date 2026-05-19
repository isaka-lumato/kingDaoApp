-- =============================================================================
-- Reference tables: clients & ICDs + seed data from PRD §13.1 / §13.2
-- =============================================================================

create table public.clients (
  id              uuid          primary key default gen_random_uuid(),
  name            text          not null,
  sub_label       text,
  contact_email   text,
  notes           text,
  is_active       boolean       not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create unique index clients_name_active_uq
  on public.clients (name, coalesce(sub_label, ''))
  where deleted_at is null;

create index clients_active_idx on public.clients (is_active) where deleted_at is null;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.log_table_change();

comment on table public.clients is 'Consignee organizations. Sub-label tracks variants like PAPA - SAAJT, PAPA - YAKET.';

-- ICDs ------------------------------------------------------------------------
create table public.icds (
  id              uuid          primary key default gen_random_uuid(),
  name            text          not null,
  location        text,
  is_active       boolean       not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create unique index icds_name_uq on public.icds (name) where deleted_at is null;
create index icds_active_idx on public.icds (is_active) where deleted_at is null;

create trigger icds_set_updated_at
  before update on public.icds
  for each row execute function public.set_updated_at();

create trigger icds_audit
  after insert or update or delete on public.icds
  for each row execute function public.log_table_change();

comment on table public.icds is 'Inland Container Depots / yards where containers are stored. PRD §13.2.';

-- Seed clients (PRD §13.1) ----------------------------------------------------
insert into public.clients (name, sub_label) values
  ('TZ CHINA',     null),
  ('BREE AUTO',    null),
  ('HEBERY',       null),
  ('KEVLA',        null),
  ('SEIKO',        null),
  ('XIN WANG',     null),
  ('PAPA',         'SAAJT'),
  ('PAPA',         'YAKET'),
  ('PAPA',         'MOTA'),
  ('PAPA',         'HUAXIA'),
  ('PAPA',         'SAMYI'),
  ('PEAKPARK',     null),
  ('PDW',          null),
  ('MUKI (T)',     null),
  ('JOYCE',        'PHOENIX'),
  ('JOYCE',        'SEIKO'),
  ('JOYCE',        'TITANIUM'),
  ('JOYCE',        'ZHONGJI'),
  ('JOYCE',        'VMEN'),
  ('JOYCE',        'HALO'),
  ('JOYCE',        'TIANYU'),
  ('JOYCE',        'BEIJING'),
  ('KUNLUN',       null),
  ('ALEX',         'ADH'),
  ('ALEX',         'BRADESH'),
  ('ALEX',         'MAWAZO'),
  ('ALEX',         'GERALD'),
  ('ALEX',         'ZEAL'),
  ('SINORA ZM',    null),
  ('TOPRICH',      null),
  ('DRACAENA',     null),
  ('ROYAL ROAD',   null),
  ('WANGTEK',      null),
  ('COSMAC',       null),
  ('CONFORT',      null),
  ('CALISTA',      null),
  ('JOHNSON',      null),
  ('NAJIBU',       null),
  ('DIANA',        null);

-- Seed ICDs (PRD §13.2) -------------------------------------------------------
insert into public.icds (name) values
  ('AFRICAN ICD'), ('GALCO UDART'), ('GALCO'), ('GALCO - 025'), ('GALCO KIGA'),
  ('GALCO 025'), ('HESU'), ('DP WORLD'), ('DICD'), ('SSA LOGISTICS'),
  ('FARION'), ('BLOOMER'), ('ZAMBIA CARGO'), ('SWIFT CARGO'), ('SILVER'),
  ('AZAM'), ('PMM'), ('TRH'), ('EAST COAST'), ('LUNA TRADING'),
  ('TRANS AFRICAN'), ('ROUTE MASTER'), ('AMI'), ('AL-HUSHOOM'), ('JEFAG'),
  ('TEAVTL'), ('TEAGTL'), ('DEUMEUM'), ('SALISLA'), ('ETC CARGO'),
  ('HECO'), ('TPA MTWARA'), ('TPA TANGA'), ('TPA DAR'), ('NAMANGA BDR'),
  ('FAB INTERNATIONAL'), ('CHICASA');
