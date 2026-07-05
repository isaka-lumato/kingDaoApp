/**
 * Plain-English permission groups (D-063).
 *
 * The `/settings/roles` screen used to expose one Read + one Write toggle for
 * every raw `consignments` column (~54 switches) — unreadable to non-technical
 * customs staff, and the Read toggles weren't even enforced on display.
 *
 * Groups are a *presentation layer* over the existing
 * `role_column_permissions` table. Each group maps to one or more real
 * `(table_name, column_name)` rows and a single `read` or `write` intent.
 * Toggling a group writes `can_read`/`can_write` on every underlying row via
 * `updateGroupPermAction`. The DB write-guard trigger
 * (`consignments_enforce_column_write`) and the display-layer read checks then
 * enforce them — no group has behavior that isn't backed by a stored row.
 *
 * `advance_stage` and `read` (on `audit_log`) are *synthetic* columns: they
 * don't exist on the table, but the permission system treats them as gateable
 * capabilities (advancing a pipeline stage; opening the Activity page).
 */

export type PermissionGroupKind = "read" | "write";

export type PermissionGroup = {
  /** Stable id, used as the form field / action argument. */
  id: string;
  /** Human-readable label shown in the roles UI. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  kind: PermissionGroupKind;
  /** The columns this group controls (all under `consignments` unless noted). */
  columns: { table: string; column: string }[];
};

const consignmentCols = (...columns: string[]) =>
  columns.map((column) => ({ table: "consignments", column }));

export const PERMISSION_GROUPS: PermissionGroup[] = [
  // ── READ ──────────────────────────────────────────────────────────────────
  {
    id: "see_amounts",
    label: "See financial amounts",
    description:
      "Show consignment amounts and revenue totals across the dashboard, lists, detail pages and exports.",
    kind: "read",
    columns: consignmentCols("amount"),
  },
  {
    id: "view_activity",
    label: "View activity log",
    description: "Open the Activity page (all changes + usage history).",
    kind: "read",
    columns: [{ table: "audit_log", column: "read" }],
  },

  // ── WRITE ─────────────────────────────────────────────────────────────────
  {
    id: "add_consignments",
    label: "Add new consignments",
    description: "Create new consignments from the New Consignment form.",
    kind: "write",
    // ref_no can_write is the create gate (create-consignment.ts).
    columns: consignmentCols("ref_no"),
  },
  {
    id: "advance_stage",
    label: "Advance pipeline stages",
    description:
      "Move consignments forward through the pipeline (Manifest → … → Released).",
    kind: "write",
    // Synthetic capability column — gated by advance_stage() in the DB.
    columns: consignmentCols("advance_stage"),
  },
  {
    id: "edit_amounts",
    label: "Edit financial amounts",
    description: "Change the amount on a consignment.",
    kind: "write",
    columns: consignmentCols("amount"),
  },
  {
    id: "edit_client",
    label: "Edit client assignment",
    description: "Change which client a consignment belongs to.",
    kind: "write",
    columns: consignmentCols("client_id"),
  },
  {
    id: "edit_shipment",
    label: "Edit shipment details",
    description:
      "Edit B/L, TANSAD, vessel, arrival/release dates, cargo, goods, ICD, EFD receipt and remarks.",
    kind: "write",
    columns: consignmentCols(
      "bl_number",
      "tansad_no",
      "vessel_name",
      "arrival_date",
      "release_date",
      "cargo_count",
      "cargo_type",
      "goods_description",
      "icd_id",
      "efd_receipt_no",
      "remarks",
    ),
  },
];

export const READ_GROUPS = PERMISSION_GROUPS.filter((g) => g.kind === "read");
export const WRITE_GROUPS = PERMISSION_GROUPS.filter((g) => g.kind === "write");

export function getPermissionGroup(id: string): PermissionGroup | undefined {
  return PERMISSION_GROUPS.find((g) => g.id === id);
}
