"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createClientAction,
  updateClientAction,
  deleteClientAction,
} from "@/server/actions/settings-reference";
import { usePermissions } from "@/hooks/use-permissions";

export type ClientListRow = {
  id: string;
  name: string;
  sub_label: string | null;
  contact_email: string | null;
  notes: string | null;
  is_active: boolean;
};

// Add/edit modal state. `null` = closed.
type ModalState = { mode: "add" } | { mode: "edit"; row: ClientListRow } | null;

function label(c: ClientListRow) {
  return c.sub_label ? `${c.name} — ${c.sub_label}` : c.name;
}

export default function ClientsListPanel({ clients }: { clients: ClientListRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");
  const { isAdmin } = usePermissions();

  // Preserve the current ?year when switching clients.
  function selectHref(id: string) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("c", id);
    return `/clients?${next.toString()}`;
  }

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ClientListRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => label(c).toLowerCase().includes(q));
  }, [clients, search]);

  function openAdd() {
    setFormError(null);
    setModal({ mode: "add" });
  }

  function openEdit(row: ClientListRow) {
    setFormError(null);
    setMenuFor(null);
    setModal({ mode: "edit", row });
  }

  function closeModal() {
    setModal(null);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const action = modal.mode === "add" ? createClientAction : updateClientAction;
    startTransition(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) {
        setFormError(res.error);
      } else {
        form.reset();
        closeModal();
        // The server action revalidates /clients; refresh so this list
        // (a client component) re-reads the new server payload.
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const fd = new FormData();
    fd.set("id", deleting.id);
    startTransition(async () => {
      const res = await deleteClientAction(fd);
      if (res && "error" in res && res.error) {
        setDeleteError(res.error);
      } else {
        const wasSelected = selectedId === deleting.id;
        setDeleting(null);
        // If we just deleted the open client, clear the stale detail.
        if (wasSelected) router.push("/clients");
        else router.refresh();
      }
    });
  }

  return (
    <div className="w-64 shrink-0 space-y-2">
      <div className="flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {isAdmin && (
          <button
            id="new-client-btn"
            title="New client"
            onClick={openAdd}
            className="shrink-0 flex items-center justify-center rounded-lg bg-primary px-3 text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-[70vh] overflow-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No clients match.</p>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={[
              "group relative flex items-center rounded-lg transition-colors",
              selectedId === c.id
                ? "bg-brand/15 border border-brand/30"
                : "hover:bg-muted/40",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => router.push(selectHref(c.id), { scroll: false })}
              className={[
                "block flex-1 min-w-0 text-left px-3 py-2.5",
                selectedId === c.id
                  ? "text-foreground"
                  : "text-muted-foreground group-hover:text-foreground",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{c.name}</span>
                {!c.is_active && (
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                    inactive
                  </span>
                )}
              </div>
              {c.sub_label && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.sub_label}</p>
              )}
            </button>

            {isAdmin && (
              <RowMenu
                open={menuFor === c.id}
                onToggle={() => setMenuFor((m) => (m === c.id ? null : c.id))}
                onClose={() => setMenuFor(null)}
                onEdit={() => openEdit(c)}
                onDelete={() => {
                  setMenuFor(null);
                  setDeleteError(null);
                  setDeleting(c);
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {modal.mode === "add" ? "New client" : "Edit client"}
            </h3>
            <p className="text-muted-foreground text-sm mb-5">
              {modal.mode === "add"
                ? "Adds a consignee organisation. Variant distinguishes sub-clients (e.g. PAPA — SAAJT)."
                : "Update this client's details."}
            </p>

            {formError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <form
              key={modal.mode === "edit" ? modal.row.id : "add"}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {modal.mode === "edit" && (
                <input type="hidden" name="id" value={modal.row.id} />
              )}
              <ModalField
                name="name"
                label="Name"
                required
                placeholder="e.g. PAPA"
                defaultValue={modal.mode === "edit" ? modal.row.name : ""}
              />
              <ModalField
                name="sub_label"
                label="Variant"
                placeholder="e.g. SAAJT (optional)"
                defaultValue={modal.mode === "edit" ? (modal.row.sub_label ?? "") : ""}
              />
              <ModalField
                name="contact_email"
                label="Contact email"
                type="email"
                placeholder="optional"
                defaultValue={modal.mode === "edit" ? (modal.row.contact_email ?? "") : ""}
              />
              <ModalField
                name="notes"
                label="Notes"
                placeholder="optional"
                defaultValue={modal.mode === "edit" ? (modal.row.notes ?? "") : ""}
              />
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {isPending
                    ? "Saving…"
                    : modal.mode === "add"
                      ? "Create client"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleting(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">Delete client</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Delete <span className="font-medium text-foreground">{label(deleting)}</span>? It
              will be hidden from lists but remains recoverable. A client with consignments cannot
              be deleted.
            </p>

            {deleteError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowMenu({
  open,
  onToggle,
  onClose,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative shrink-0 pr-1">
      <button
        type="button"
        title="Client actions"
        onClick={onToggle}
        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={onEdit}
            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ModalField({
  name,
  label,
  required,
  type = "text",
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`client-field-${name}`} className="block text-sm font-medium text-foreground">
        {label}
        {!required && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </label>
      <input
        id={`client-field-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
