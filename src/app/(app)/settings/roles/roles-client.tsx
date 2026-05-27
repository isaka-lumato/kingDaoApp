"use client";

import { useState, useTransition } from "react";
import {
  createRoleAction,
  deleteRoleAction,
  getRolePermissionsAction,
  updateColumnPermAction,
} from "@/server/actions/settings-roles";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  writeableColumnCount: number;
};

type Props = {
  roles: RoleRow[];
  fetchError?: string;
};

// All consignment columns that can have permissions configured.
const CONSIGNMENT_COLUMNS = [
  "ref_no", "tansad_no", "bl_number", "container_count", "container_type",
  "goods_description", "vessel_name", "arrival_date", "icd_id",
  "in_ref_batch_id", "remarks", "amount", "client_id",
  "manifest_status", "shipping_batch_status", "tanesws_status",
  "assessment_status", "tbs_loading_status", "tbs_debit_status",
  "manifest_comp_status", "duty_status", "inspection_file_status",
  "release_status", "release_date", "shared_with_consignment_id",
];

export default function RolesClient({ roles, fetchError }: Props) {
  const [selectedRole, setSelectedRole] = useState<RoleRow | null>(null);
  const [permissions, setPermissions] = useState<
    { table_name: string; column_name: string; can_read: boolean; can_write: boolean }[]
  >([]);
  const [permLoading, setPermLoading] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function openRole(role: RoleRow) {
    setSelectedRole(role);
    setPermLoading(true);
    const res = await getRolePermissionsAction(role.id);
    setPermissions(res.permissions ?? []);
    setPermLoading(false);
  }

  function getPerm(col: string) {
    return permissions.find(
      (p) => p.table_name === "consignments" && p.column_name === col
    );
  }

  function togglePerm(col: string, field: "can_read" | "can_write", current: boolean) {
    if (!selectedRole || selectedRole.is_system) return;
    const fd = new FormData();
    fd.set("roleId", selectedRole.id);
    fd.set("tableName", "consignments");
    fd.set("columnName", col);
    const perm = getPerm(col);
    fd.set("canRead", field === "can_read" ? String(!current) : String(perm?.can_read ?? false));
    fd.set("canWrite", field === "can_write" ? String(!current) : String(perm?.can_write ?? false));
    startTransition(async () => {
      await updateColumnPermAction(fd);
      // Optimistically update local state.
      setPermissions((prev) => {
        const idx = prev.findIndex(
          (p) => p.table_name === "consignments" && p.column_name === col
        );
        const updated = { table_name: "consignments", column_name: col, can_read: perm?.can_read ?? false, can_write: perm?.can_write ?? false, [field]: !current };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
    });
  }

  function handleClone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCloneError(null);
    const fd = new FormData(e.currentTarget);
    if (selectedRole) fd.set("cloneFromId", selectedRole.id);
    startTransition(async () => {
      const res = await createRoleAction(fd);
      if (res && "error" in res) {
        setCloneError(res.error ?? "Unknown error");
      } else {
        setCloneOpen(false);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  function handleDelete(role: RoleRow) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set("roleId", role.id);
    startTransition(async () => {
      const res = await deleteRoleAction(fd);
      if (res && "error" in res) alert(res.error);
      else setSelectedRole(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Roles &amp; Permissions</h2>
          <p className="text-muted-foreground text-sm">
            System roles are read-only. Clone them to create custom roles.
          </p>
        </div>
        <button
          id="create-role-btn"
          onClick={() => { setSelectedRole(null); setCloneOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New role
        </button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="flex gap-6">
        {/* Role list */}
        <div className="w-56 shrink-0 space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => openRole(role)}
              className={[
                "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                selectedRole?.id === role.id
                  ? "bg-brand/15 border border-brand/30 text-foreground"
                  : "hover:bg-muted/40 text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{role.name}</span>
                {role.is_system && (
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                    system
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {role.is_system ? "Full access (admin)" : `${role.writeableColumnCount} writable cols`}
              </p>
            </button>
          ))}
        </div>

        {/* Permission matrix */}
        {selectedRole ? (
          <div className="flex-1 rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div>
                <span className="font-semibold text-foreground">{selectedRole.name}</span>
                {selectedRole.is_system && (
                  <span className="ml-2 text-xs text-muted-foreground">(system role — read only)</span>
                )}
              </div>
              <div className="flex gap-2">
                {!selectedRole.is_system && (
                  <>
                    <button
                      onClick={() => setCloneOpen(true)}
                      className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted/40 transition-colors text-foreground"
                    >
                      Clone
                    </button>
                    <button
                      onClick={() => handleDelete(selectedRole)}
                      className="text-xs rounded-lg border border-destructive/40 px-3 py-1.5 hover:bg-destructive/10 transition-colors text-destructive"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {selectedRole.is_system ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                {selectedRole.name === "admin"
                  ? "Admin has implicit read + write access to all columns."
                  : "System role permissions are fixed. Clone this role to create a customisable variant."}
              </div>
            ) : permLoading ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm animate-pulse">
                Loading permissions…
              </div>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Column</th>
                      <th className="text-center px-4 py-2 font-medium text-muted-foreground w-20">Read</th>
                      <th className="text-center px-4 py-2 font-medium text-muted-foreground w-20">Write</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {CONSIGNMENT_COLUMNS.map((col) => {
                      const perm = getPerm(col);
                      const canRead = perm?.can_read ?? false;
                      const canWrite = perm?.can_write ?? false;
                      return (
                        <tr key={col} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground">{col}</td>
                          <td className="px-4 py-2.5 text-center">
                            <Toggle
                              checked={canRead}
                              onChange={() => togglePerm(col, "can_read", canRead)}
                              disabled={isPending}
                              id={`read-${col}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Toggle
                              checked={canWrite}
                              onChange={() => togglePerm(col, "can_write", canWrite)}
                              disabled={isPending}
                              id={`write-${col}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 rounded-xl border border-border border-dashed flex items-center justify-center text-muted-foreground text-sm">
            Select a role to view its permissions
          </div>
        )}
      </div>

      {/* Clone / Create modal */}
      {cloneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCloneOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {selectedRole ? `Clone "${selectedRole.name}"` : "New custom role"}
            </h3>
            <p className="text-muted-foreground text-sm mb-5">
              {selectedRole
                ? "Creates a new role with the same column permissions. You can adjust them afterwards."
                : "Creates a blank role with no permissions set."}
            </p>

            {cloneError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {cloneError}
              </div>
            )}

            <form onSubmit={handleClone} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="role-name" className="block text-sm font-medium text-foreground">
                  Role name <span className="text-muted-foreground font-normal">(lowercase, no spaces)</span>
                </label>
                <input
                  id="role-name"
                  name="name"
                  required
                  placeholder="operator-no-billing"
                  pattern="^[a-z0-9_-]+$"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="role-desc" className="block text-sm font-medium text-foreground">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="role-desc"
                  name="description"
                  placeholder="Like operator but cannot edit amounts"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCloneOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {isPending ? "Creating…" : "Create role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent",
        "transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-brand" : "bg-muted",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
