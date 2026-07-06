/**
 * Shared formatting for the append-only `audit_log`. Used by both the
 * per-consignment audit panel and the global Activity feed (D-055). Keep this
 * the single source of truth — do not re-inline these in components.
 */

const SENTINEL_COLUMNS = new Set(["_inserted", "_deleted", "FORCED_STAGE_CHANGE"]);

/** Row-level sentinel rather than a real column change. */
export function isSentinelColumn(col: string | null): boolean {
  return col != null && SENTINEL_COLUMNS.has(col);
}

/**
 * Stringify a jsonb audit value for display. Truncates long object dumps
 * (the _inserted / _deleted sentinel rows write the entire row into
 * new_value / old_value respectively).
 */
export function renderAuditValue(v: unknown, maxLen = 60): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return "[unrenderable]";
  }
}

// Friendlier labels for the most common audited columns. Anything not listed
// falls back to the raw column name (still readable, just snake_case).
const COLUMN_LABELS: Record<string, string> = {
  ref_no: "Reference no",
  tansad_no: "TANSAD no",
  bl_number: "B/L number",
  cargo_count: "Cargo count",
  cargo_type: "Cargo type",
  goods_description: "Goods description",
  vessel_name: "Vessel name",
  arrival_date: "Arrival date",
  release_date: "Release date",
  release_status: "Release status",
  client_id: "Client",
  icd_id: "ICD",
  amount: "Amount",
  remarks: "Remarks",
  can_read: "Read permission",
  can_write: "Write permission",
  role_id: "Role",
  user_id: "User",
};

/**
 * Human-readable label for the `column_name` field. The audit trigger uses
 * `_inserted` / `_deleted` (and the app's `FORCED_STAGE_CHANGE`) sentinels for
 * row-level events; everything else is a real column name.
 */
export function renderColumnLabel(col: string | null): string {
  if (!col) return "—";
  if (col === "_inserted") return "Row created";
  if (col === "_deleted") return "Row deleted";
  if (col === "FORCED_STAGE_CHANGE") return "Forced stage change";
  return COLUMN_LABELS[col] ?? col;
}

// Friendly singular labels for audited tables in the global feed.
const TABLE_LABELS: Record<string, string> = {
  consignments: "Consignment",
  efd_records: "EFD record",
  clients: "Client",
  icds: "ICD",
  vessels: "Vessel",
  roles: "Role",
  user_roles: "User role",
  role_column_permissions: "Permission",
  guta_pairs: "GUTA pair",
  import_jobs: "Import job",
};

/** Human-readable singular label for an audited table name. */
export function renderTableLabel(table: string): string {
  return TABLE_LABELS[table] ?? table;
}
