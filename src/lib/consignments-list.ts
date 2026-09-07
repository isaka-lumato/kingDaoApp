/**
 * Pure filter/sort/search params for the `/consignments` list. No `server-only`
 * barrier and no Supabase import, so both the client grid
 * (`consignments-client.tsx`) and the server query layer
 * (`@/server/consignments/list-query`) can import it. The Supabase-touching
 * query builders live in the server module and import these constants.
 */

/**
 * Allowlist of sortable columns: UI sort key → real DB column. Restricting to
 * this map prevents arbitrary `.order()` injection from the `sort` query param.
 * Client (a joined table) and Pipeline Stage (a computed value) are
 * intentionally absent — they are not server-sortable.
 */
export const SORTABLE_COLUMNS = {
  ref_no: "ref_no",
  year: "year",
  serial_no: "serial_no",
  arrival_date: "arrival_date",
  amount: "amount",
  vessel_name: "vessel_name",
  bl_number: "bl_number",

} as const;

export type SortKey = keyof typeof SORTABLE_COLUMNS;
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: SortKey = "serial_no";
export const DEFAULT_DIR: SortDir = "asc";

export type ListParams = {
  year: number;
  client?: string;
  stage?: string;
  q?: string;
  sort: SortKey;
  dir: SortDir;
};

/** The columns the free-text search scans directly on `consignments`. */
export const SEARCH_COLUMNS = [
  "ref_no",
  "tansad_no",
  "bl_number",

  "vessel_name",
  "goods_description",
] as const;

type RawParams = {
  year?: string;
  client?: string;
  stage?: string;
  q?: string;
  sort?: string;
  dir?: string;
};

/** Normalize raw string searchParams into a typed, defaulted `ListParams`. */
export function parseListParams(params: RawParams): ListParams {
  const year = params.year
    ? Number.parseInt(params.year, 10) || new Date().getFullYear()
    : new Date().getFullYear();

  const sort: SortKey =
    params.sort && params.sort in SORTABLE_COLUMNS
      ? (params.sort as SortKey)
      : DEFAULT_SORT;
  const dir: SortDir = params.dir === "desc" ? "desc" : DEFAULT_DIR;

  const q = params.q?.trim();

  return {
    year,
    client: params.client || undefined,
    stage: params.stage || undefined,
    q: q || undefined,
    sort,
    dir,
  };
}

/**
 * Strip the characters that have structural meaning inside a PostgREST `.or()`
 * filter string (`,` separates terms, `()` group, `*` is the ilike wildcard we
 * add ourselves, `"`/`\` quote). Whatever remains is matched literally.
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*"\\]/g, " ").trim();
}

/** Server-side page size for the `/consignments` grid. */
export const LIST_PAGE_SIZE = 50;

/** One row of the `/consignments` grid — the shape `CONSIGNMENT_SELECT` returns. */
export type ConsignmentListRow = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  tansad_no: string | null;
  bl_number: string | null;
  client_id: string;
  cargo_count: number | null;
  cargo_type: string | null;
  efd_receipt_no: string | null;
  goods_description: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  amount: number | null;
  release_status: string;
  release_date: string | null;
  manifest_status: string;
  shipping_batch_status: string;
  tanesws_status: string;
  assessment_status: string;
  tbs_loading_status: string;
  tbs_debit_status: string;
  manifest_comp_status: string;
  duty_status: string;
  inspection_file_status: string;
  updated_at: string;
  clients: { id: string; name: string } | null;
};

/** One page of grid results — the `listConsignmentsAction` return shape. */
export type ConsignmentListPage = {
  rows: ConsignmentListRow[];
  total: number;
  error?: string;
};

/**
 * The full on-screen view state: `ListParams` plus the 1-based page. This is
 * both the TanStack Query key input and the URL's search-param source (D-065).
 */
export type ListView = ListParams & { page: number };

/**
 * Serialize a `ListView` into a URL search string. Used for the address-bar
 * sync, the export links, and to compare the live view against the one the
 * server rendered (so `initialData` seeds the matching cache key exactly once).
 *
 * `page` is omitted when 1 so the canonical first-page URL stays clean.
 */
export function buildListSearch(view: ListView): string {
  const p = new URLSearchParams();
  p.set("year", String(view.year));
  if (view.client) p.set("client", view.client);
  if (view.stage) p.set("stage", view.stage);
  if (view.q) p.set("q", view.q);
  p.set("sort", view.sort);
  p.set("dir", view.dir);
  if (view.page > 1) p.set("page", String(view.page));
  return p.toString();
}
