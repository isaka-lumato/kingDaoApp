"use client";

import { useState, useTransition } from "react";

// Generic management UI for a reference table (clients / ICDs / vessels). D-050.
// The three entities differ only in their editable fields and which server
// actions they call, so the screen is one configurable component rather than
// three near-identical copies.

export type RefField = {
  name: string;
  label: string;
  required?: boolean;
  type?: "text" | "email";
  placeholder?: string;
};

export type RefRow = {
  id: string;
  is_active: boolean;
  // Field values keyed by field name (string | null).
  [key: string]: string | boolean | null;
};

type ActionResult = { error?: string; success?: boolean } | undefined;

type Props = {
  title: string;
  singular: string; // e.g. "client", used in button labels
  fields: RefField[];
  rows: RefRow[];
  fetchError?: string;
  createAction: (fd: FormData) => Promise<ActionResult>;
  updateAction: (fd: FormData) => Promise<ActionResult>;
  setActiveAction: (fd: FormData) => Promise<ActionResult>;
};

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function ReferenceManager({
  title,
  singular,
  fields,
  rows,
  fetchError,
  createAction,
  updateAction,
  setActiveAction,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<RefRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(
    action: (fd: FormData) => Promise<ActionResult>,
    fd: FormData,
    onDone: () => void,
    form?: HTMLFormElement
  ) {
    setFormError(null);
    startTransition(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) {
        setFormError(res.error);
      } else {
        form?.reset();
        onDone();
      }
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    submit(createAction, new FormData(form), () => setAddOpen(false), form);
  }

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    submit(updateAction, new FormData(form), () => setEditing(null), form);
  }

  function toggleActive(row: RefRow) {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("isActive", String(!row.is_active));
    startTransition(async () => {
      await setActiveAction(fd);
    });
  }

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-sm">
            {rows.length} total · {activeCount} active
          </p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setAddOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add {singular}
        </button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load {title.toLowerCase()}: {fetchError}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {fields.map((f) => (
                <th key={f.name} className="text-left px-4 py-3 font-medium text-muted-foreground">
                  {f.label}
                </th>
              ))}
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  None yet. Add {singular} to get started.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                {fields.map((f, i) => (
                  <td key={f.name} className={i === 0 ? "px-4 py-3 font-medium text-foreground" : "px-4 py-3 text-muted-foreground"}>
                    {(row[f.name] as string | null) || (i === 0 ? "—" : "")}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${row.is_active ? "text-stage-done" : "text-muted-foreground"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setFormError(null);
                        setEditing(row);
                      }}
                      className="text-xs font-medium text-foreground hover:text-brand transition-colors"
                    >
                      Edit
                    </button>
                    <span className="text-border">·</span>
                    <button
                      onClick={() => toggleActive(row)}
                      disabled={isPending}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {row.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit modal */}
      {(addOpen || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setAddOpen(false);
              setEditing(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-5">
              {editing ? `Edit ${singular}` : `Add ${singular}`}
            </h3>

            {formError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <form onSubmit={editing ? handleEdit : handleCreate} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              {fields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {f.label}
                    {f.required && <span className="text-destructive ml-1">*</span>}
                  </label>
                  <input
                    name={f.name}
                    type={f.type ?? "text"}
                    required={f.required}
                    placeholder={f.placeholder}
                    defaultValue={editing ? ((editing[f.name] as string | null) ?? "") : ""}
                    className={inputCls}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setEditing(null);
                  }}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {isPending ? "Saving…" : editing ? "Save changes" : `Add ${singular}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
