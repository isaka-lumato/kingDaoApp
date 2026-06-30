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
