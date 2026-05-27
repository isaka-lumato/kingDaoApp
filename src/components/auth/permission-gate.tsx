"use client";

import type { ReactNode } from "react";
import { useColumnPermission } from "@/hooks/use-permissions";

type Props = {
  /** DB table name (e.g. "consignments"). */
  table: string;
  /** DB column name (e.g. "amount"). */
  column: string;
  /**
   * "write" (default): renders children only when the user can write.
   * "read": renders children only when the user can read.
   */
  mode?: "read" | "write";
  /**
   * What to render when the user lacks permission.
   * - undefined (default): renders nothing.
   * - "disabled": clones the first child and adds disabled + aria-disabled.
   * - ReactNode: renders the fallback node.
   */
  fallback?: "disabled" | ReactNode;
  children: ReactNode;
};

/**
 * T-033 — PermissionGate
 *
 * Conditionally renders children based on the current user's per-column
 * permission. Works in tandem with the server-side RLS enforcement.
 *
 * Usage:
 *   <PermissionGate table="consignments" column="amount">
 *     <AmountInput />
 *   </PermissionGate>
 *
 *   <PermissionGate table="consignments" column="amount" fallback="disabled">
 *     <AmountInput />
 *   </PermissionGate>
 */
export function PermissionGate({
  table,
  column,
  mode = "write",
  fallback,
  children,
}: Props) {
  const { canRead, canWrite } = useColumnPermission(table, column);
  const allowed = mode === "write" ? canWrite : canRead;

  if (allowed) return <>{children}</>;

  // No fallback → render nothing.
  if (fallback === undefined) return null;

  // Disabled fallback → render child as read-only.
  if (fallback === "disabled") {
    return (
      <div
        aria-disabled="true"
        className="pointer-events-none opacity-50 select-none"
        title={`You don't have permission to ${mode} this field.`}
      >
        {children}
      </div>
    );
  }

  // Custom fallback node.
  return <>{fallback}</>;
}
