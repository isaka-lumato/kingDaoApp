"use client";

import { useState, useTransition } from "react";
import {
  createRoleAction,
  deleteRoleAction,
  getRolePermissionsAction,
  updateGroupPermAction,
} from "@/server/actions/settings-roles";
import {
  READ_GROUPS,
  WRITE_GROUPS,
  type PermissionGroup,
} from "@/lib/permission-groups";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  writeableColumnCount: number;
};

type PermissionRow = {
  table_name: string;
  column_name: string;
  can_read: boolean;
  can_write: boolean;
};

type Props = {
  roles: RoleRow[];
  fetchError?: string;
};

function roleSubtitle(role: RoleRow): string {
  switch (role.name) {
    case "admin":
      return "Full access";
    case "operator":
      return "Operational staff defaults";
    case "viewer":
      return "Read-only";
    default:
      return role.is_system
        ? role.description ?? "System role"
        : `${role.writeableColumnCount} writable capabilities`;
  }
}

function groupsBySection(groups: PermissionGroup[]): [string, PermissionGroup[]][] {
  const sections = new Map<string, PermissionGroup[]>();
  for (const group of groups) {
    const existing = sections.get(group.section) ?? [];
    existing.push(group);
    sections.set(group.section, existing);
  }
  return Array.from(sections.entries());
}

export default function RolesClient({ roles, fetchError }: Props) {
  const [selectedRole, setSelectedRole] = useState<RoleRow | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function openRole(role: RoleRow) {
    setSelectedRole(role);
    setPermLoading(true);
    setPermError(null);
    const res = await getRolePermissionsAction(role.id);
    setPermissions(res.permissions ?? []);
    if (res.error) setPermError(res.error);
    setPermLoading(false);
  }

  function getPerm(table: string, column: string) {
    return permissions.find(
      (permission) =>
        permission.table_name === table && permission.column_name === column,
    );
  }

  function groupEnabled(group: PermissionGroup): boolean {
    return group.columns.every((target) => {
      const permission = getPerm(target.table, target.column);
      return group.kind === "read"
        ? permission?.can_read ?? false
        : permission?.can_write ?? false;
    });
  }

  function toggleGroup(group: PermissionGroup) {
    if (!selectedRole || selectedRole.is_system) return;

    const enabled = !groupEnabled(group);
    const previous = permissions;
    const fd = new FormData();
    fd.set("roleId", selectedRole.id);
    fd.set("groupId", group.id);
    fd.set("enabled", String(enabled));

    setPermError(null);
    setPermissions((current) => {
      const next = [...current];
      for (const target of group.columns) {
        const idx = next.findIndex(
          (permission) =>
            permission.table_name === target.table &&
            permission.column_name === target.column,
        );
        const currentPermission =
          idx >= 0
            ? next[idx]
            : {
                table_name: target.table,
                column_name: target.column,
                can_read: false,
                can_write: false,
              };
        const updated = {
          ...currentPermission,
          can_read:
            group.kind === "read"
              ? enabled || currentPermission.can_write
              : enabled || currentPermission.can_read,
          can_write: group.kind === "write" ? enabled : currentPermission.can_write,
        };
        if (idx >= 0) next[idx] = updated;
        else next.push(updated);
      }
      return next;
    });

    startTransition(async () => {
      const res = await updateGroupPermAction(fd);
      if (res && "error" in res) {
        setPermissions(previous);
        setPermError(res.error ?? "Permission update failed.");
      }
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Roles &amp; Permissions
          </h2>
          <p className="text-sm text-muted-foreground">
            Clone a system role, then adjust the business capabilities for that custom role.
          </p>
        </div>
        <button
          id="create-role-btn"
          onClick={() => {
            setSelectedRole(null);
            setCloneOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <span className="text-base leading-none">+</span>
          New role
        </button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-60 shrink-0 space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => openRole(role)}
              className={[
                "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                selectedRole?.id === role.id
                  ? "border border-brand/30 bg-brand/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{role.name}</span>
                {role.is_system && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    system
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {roleSubtitle(role)}
              </p>
            </button>
          ))}
        </div>

        {selectedRole ? (
          <div className="flex-1 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-3">
              <div>
                <span className="font-semibold text-foreground">{selectedRole.name}</span>
                {selectedRole.is_system && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (system role, read only)
                  </span>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {roleSubtitle(selectedRole)}
                </p>
              </div>
              {!selectedRole.is_system && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setCloneOpen(true)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/40"
                  >
                    Clone
                  </button>
                  <button
                    onClick={() => handleDelete(selectedRole)}
                    className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {selectedRole.name === "admin" ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Admin has implicit read and write access to everything.
              </div>
            ) : permLoading ? (
              <div className="animate-pulse px-4 py-8 text-center text-sm text-muted-foreground">
                Loading permissions...
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                {selectedRole.is_system && (
                  <p className="border-b border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    These permissions are fixed for system roles. Clone this role to create a custom version.
                  </p>
                )}

                {permError && (
                  <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {permError}
                  </div>
                )}

                <div className="space-y-6 px-4 py-4">
                  <PermissionGroupSections
                    title="Read access"
                    groups={READ_GROUPS}
                    checked={groupEnabled}
                    onToggle={toggleGroup}
                    disabled={isPending || selectedRole.is_system}
                  />
                  <PermissionGroupSections
                    title="Work access"
                    groups={WRITE_GROUPS}
                    checked={groupEnabled}
                    onToggle={toggleGroup}
                    disabled={isPending || selectedRole.is_system}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            Select a role to view its permissions
          </div>
        )}
      </div>

      {cloneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCloneOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              {selectedRole ? `Clone "${selectedRole.name}"` : "New custom role"}
            </h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {selectedRole
                ? "Creates a new role with the same permissions. You can adjust it afterwards."
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
                  Role name <span className="font-normal text-muted-foreground">(lowercase, no spaces)</span>
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
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
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
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {isPending ? "Creating..." : "Create role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionGroupSections({
  title,
  groups,
  checked,
  onToggle,
  disabled,
}: {
  title: string;
  groups: PermissionGroup[];
  checked: (group: PermissionGroup) => boolean;
  onToggle: (group: PermissionGroup) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {groups.filter(checked).length} of {groups.length} enabled
        </span>
      </div>

      <div className="space-y-4">
        {groupsBySection(groups).map(([section, sectionGroups]) => (
          <div key={`${title}-${section}`} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section}
            </p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {sectionGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between gap-4 px-3 py-3 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{group.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                  <Toggle
                    checked={checked(group)}
                    onChange={() => onToggle(group)}
                    disabled={disabled}
                    id={`permission-${group.id}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
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
        "disabled:cursor-not-allowed disabled:opacity-50",
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
