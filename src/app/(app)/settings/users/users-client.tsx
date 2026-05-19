"use client";

import { useState, useTransition } from "react";
import {
  inviteUserAction,
  deactivateUserAction,
  reactivateUserAction,
  removeRoleAction,
} from "@/server/actions/settings-users";

type Role = { id: string; name: string };
type UserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
  roles: Role[];
  confirmed: boolean;
};

type Props = {
  users: UserRow[];
  roles: Role[];
  fetchError?: string;
};

export default function UsersClient({ users, roles, fetchError }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await inviteUserAction(fd);
      if (res && "error" in res) {
        setInviteError(res.error ?? null);
      } else if (res?.success) {
        setInviteSuccess(`Invite sent to ${res.email}`);
        setInviteOpen(false);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Users</h2>
          <p className="text-muted-foreground text-sm">{users.length} member{users.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          id="invite-user-btn"
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Invite user
        </button>
      </div>

      {/* Success toast */}
      {inviteSuccess && (
        <div className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
          ✓ {inviteSuccess}
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load users: {fetchError}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Roles</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last sign-in</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No users yet. Invite someone to get started.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                allRoles={roles}
                onDeactivate={(id) => {
                  const fd = new FormData();
                  fd.set("userId", id);
                  startTransition(async () => { await deactivateUserAction(fd); });
                }}
                onReactivate={(id) => {
                  const fd = new FormData();
                  fd.set("userId", id);
                  startTransition(async () => { await reactivateUserAction(fd); });
                }}
                onRemoveRole={(userId, roleId) => {
                  const fd = new FormData();
                  fd.set("userId", userId);
                  fd.set("roleId", roleId);
                  startTransition(async () => { await removeRoleAction(fd); });
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setInviteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">Invite user</h3>
            <p className="text-muted-foreground text-sm mb-5">
              An invite email will be sent. The user sets their own password on first sign-in.
            </p>

            {inviteError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {inviteError}
              </div>
            )}

            <form id="invite-form" onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="invite-email" className="block text-sm font-medium text-foreground">
                  Email address
                </label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  placeholder="colleague@kingdao.co.tz"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="invite-role" className="block text-sm font-medium text-foreground">
                  Role
                </label>
                <select
                  id="invite-role"
                  name="roleId"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="invite-submit-btn"
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {isPending ? "Sending…" : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  allRoles,
  onDeactivate,
  onReactivate,
  onRemoveRole,
}: {
  user: UserRow;
  allRoles: Role[];
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
  onRemoveRole: (userId: string, roleId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isBanned = false; // Supabase doesn't expose ban status in list; use lastSignIn heuristic

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{user.email}</div>
        {!user.confirmed && (
          <span className="text-xs text-amber-400">Invite pending</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 && (
            <span className="text-muted-foreground text-xs italic">No role</span>
          )}
          {user.roles.map((role) => (
            <span
              key={role.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 border border-brand/20 px-2 py-0.5 text-xs font-medium text-brand"
            >
              {role.name}
              <button
                onClick={() => onRemoveRole(user.id, role.id)}
                className="hover:text-destructive transition-colors"
                title={`Remove ${role.name} role`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${user.confirmed ? "text-stage-done" : "text-stage-waiting"}`}>
          {user.confirmed ? "Active" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {user.lastSignIn
          ? new Date(user.lastSignIn).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Never"}
      </td>
      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="User actions"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-border bg-card shadow-xl py-1">
                <button
                  onClick={() => { onDeactivate(user.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted/40 transition-colors"
                >
                  Deactivate user
                </button>
                <button
                  onClick={() => { onReactivate(user.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors"
                >
                  Reactivate user
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
