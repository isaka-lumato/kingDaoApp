"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { ColumnPermission } from "@/lib/permissions";

// ─── Types (client-safe — no server-only imports) ─────────────────────────

export type ClientPermissions = {
  userId: string;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
  columns: ColumnPermission[];
};

// ─── Context ───────────────────────────────────────────────────────────────

const PermissionsContext = createContext<ClientPermissions | null>(null);

export function PermissionsProvider({
  value,
  children,
}: {
  value: ClientPermissions;
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

// ─── Hook (T-032) ─────────────────────────────────────────────────────────

/**
 * Returns the current user's permissions.
 * Must be used inside <PermissionsProvider> (the app layout sets this up).
 */
export function usePermissions(): ClientPermissions {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error(
      "usePermissions must be used within <PermissionsProvider>. " +
        "Check that the component is inside the (app) route group."
    );
  }
  return ctx;
}

/**
 * Convenience hook — returns a pair of booleans for a specific column.
 */
export function useColumnPermission(
  tableName: string,
  columnName: string
): { canRead: boolean; canWrite: boolean } {
  const { isAdmin, columns } = usePermissions();
  if (isAdmin) return { canRead: true, canWrite: true };
  const p = columns.find(
    (c) => c.tableName === tableName && c.columnName === columnName
  );
  return { canRead: p?.canRead ?? false, canWrite: p?.canWrite ?? false };
}
