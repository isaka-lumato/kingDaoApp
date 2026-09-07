/**
 * Plain-English permission groups for the Roles screen.
 *
 * Groups are a presentation layer over `role_column_permissions`. Every group
 * maps to concrete table/column rows so a toggle on the UI has a matching
 * server-side and database-side permission.
 */

export type PermissionGroupKind = "read" | "write";

export type PermissionTarget = {
  table: string;
  column: string;
};

export type PermissionGroup = {
  /** Stable id used by the server action. */
  id: string;
  label: string;
  description: string;
  section: string;
  kind: PermissionGroupKind;
  columns: PermissionTarget[];
};

const consignmentCols = (...columns: string[]): PermissionTarget[] =>
  columns.map((column) => ({ table: "consignments", column }));

const efdCols = (...columns: string[]): PermissionTarget[] =>
  columns.map((column) => ({ table: "efd_records", column }));

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "see_amounts",
    label: "See financial amounts",
    description:
      "Show consignment amounts and revenue totals on dashboards, lists, details and exports.",
    section: "Visibility",
    kind: "read",
    columns: consignmentCols("amount"),
  },
  {
    id: "view_activity",
    label: "View activity log",
    description: "Open the Activity page with all changes and usage history.",
    section: "Visibility",
    kind: "read",
    columns: [{ table: "audit_log", column: "read" }],
  },
  {
    id: "add_consignments",
    label: "Add new consignments",
    description: "Create consignments from the New Consignment form.",
    section: "Consignments",
    kind: "write",
    columns: consignmentCols("ref_no"),
  },
  {
    id: "edit_shipment",
    label: "Edit shipment details",
    description:
      "Edit B/L, TANSAD, vessel, dates, cargo, goods, ICD, EFD receipt number and remarks.",
    section: "Consignments",
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
  {
    id: "edit_client",
    label: "Edit client assignment",
    description: "Change which client a consignment belongs to.",
    section: "Consignments",
    kind: "write",
    columns: consignmentCols("client_id"),
  },
  {
    id: "edit_amounts",
    label: "Edit financial amounts",
    description: "Change the service amount on a consignment.",
    section: "Consignments",
    kind: "write",
    columns: consignmentCols("amount"),
  },
  {
    id: "update_pipeline_statuses",
    label: "Update pipeline statuses",
    description:
      "Edit the operational status fields used by manifest, duty, OGA, inspection and release tracking.",
    section: "Pipeline",
    kind: "write",
    columns: consignmentCols(
      "manifest_status",
      "shipping_batch_status",
      "tanesws_status",
      "assessment_status",
      "tbs_loading_status",
      "tbs_debit_status",
      "manifest_comp_status",
      "duty_status",
      "inspection_file_status",
      "release_status",
      "shared_with_consignment_id",
    ),
  },
  {
    id: "manage_efd_receipts",
    label: "Manage EFD receipts",
    description:
      "Create and edit EFD receipt records, including receipt code, time, flags and notes.",
    section: "EFD",
    kind: "write",
    columns: efdCols("efd_code", "efd_time", "is_private", "is_transit", "is_shared", "notes"),
  },
];

export const READ_GROUPS = PERMISSION_GROUPS.filter((group) => group.kind === "read");
export const WRITE_GROUPS = PERMISSION_GROUPS.filter((group) => group.kind === "write");

export function getPermissionGroup(id: string): PermissionGroup | undefined {
  return PERMISSION_GROUPS.find((group) => group.id === id);
}

export function isKnownPermissionTarget(table: string, column: string): boolean {
  return PERMISSION_GROUPS.some((group) =>
    group.columns.some((target) => target.table === table && target.column === column),
  );
}

export function writeGroupCount(
  permissions: { table_name: string; column_name: string; can_write: boolean }[],
): number {
  return WRITE_GROUPS.filter((group) =>
    group.columns.every((target) =>
      permissions.some(
        (permission) =>
          permission.table_name === target.table &&
          permission.column_name === target.column &&
          permission.can_write,
      ),
    ),
  ).length;
}
