"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientAction } from "@/server/actions/settings-reference";
import { usePermissions } from "@/hooks/use-permissions";

export type ClientListRow = {
  id: string;
  name: string;
  sub_label: string | null;
  is_active: boolean;
};

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
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => label(c).toLowerCase().includes(q));
  }, [clients, search]);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createClientAction(fd);
      if (res && "error" in res && res.error) {
        setAddError(res.error);
      } else {
        setAddOpen(false);
        form.reset();
        // createClientAction revalidates /settings/clients, not /clients — refresh
        // so the new client shows up in this list.
        router.refresh();
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
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
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
          <button
            key={c.id}
            type="button"
            onClick={() => router.push(selectHref(c.id), { scroll: false })}
            className={[
              "block w-full text-left rounded-lg px-3 py-2.5 transition-colors",
              selectedId === c.id
                ? "bg-brand/15 border border-brand/30 text-foreground"
                : "hover:bg-muted/40 text-muted-foreground hover:text-foreground",
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
        ))}
      </div>

      {/* New client modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">New client</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Adds a consignee organisation. Variant distinguishes sub-clients (e.g. PAPA — SAAJT).
            </p>

            {addError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {addError}
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-4">
              <ModalField name="name" label="Name" required placeholder="e.g. PAPA" />
              <ModalField name="sub_label" label="Variant" placeholder="e.g. SAAJT (optional)" />
              <ModalField name="contact_email" label="Contact email" type="email" placeholder="optional" />
              <ModalField name="notes" label="Notes" placeholder="optional" />
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {isPending ? "Creating…" : "Create client"}
                </button>
              </div>
            </form>
          </div>
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
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`new-client-${name}`} className="block text-sm font-medium text-foreground">
        {label}
        {!required && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </label>
      <input
        id={`new-client-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
