"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createClientAction,
  updateClientAction,
  setClientActiveAction,
} from "@/server/actions/settings-reference";
import { usePermissions } from "@/hooks/use-permissions";
import { formatTzs } from "@/lib/money";

export type ClientTableRow = {
  id: string;
  name: string;
  company: string | null;
  display_name: string | null;
  contact_email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  // Per-year aggregates from v_client_volume (0 when the client has no jobs).
  jobCount: number;
  totalContainers: number;
  totalRevenue: number | null;
};

type ModalState =
  | { mode: "add" }
  | { mode: "edit"; row: ClientTableRow }
  | null;

// Displayed Name is the label shown everywhere; fall back to name when unset (D-057).
function label(c: ClientTableRow) {
  return c.display_name?.trim() || c.name;
}

// ── Column definitions ────────────────────────────────────────────────────────
// `name` is always shown and not toggleable. The rest are user-toggleable via the
// Columns button and persisted to localStorage.

type ColumnKey =
  | "company"
  | "display_name"
  | "contact_email"
  | "phone"
  | "jobCount"
  | "totalContainers"
  | "totalRevenue";

type SortKey = "name" | ColumnKey;
type SortDir = "asc" | "desc";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  align: "left" | "right";
  numeric: boolean;
  adminOnly?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company", align: "left", numeric: false },
  { key: "display_name", label: "Displayed Name", align: "left", numeric: false },
  { key: "contact_email", label: "Email", align: "left", numeric: false },
  { key: "phone", label: "Phone", align: "left", numeric: false },
  { key: "jobCount", label: "Jobs", align: "right", numeric: true },
  { key: "totalContainers", label: "Containers", align: "right", numeric: true },
  { key: "totalRevenue", label: "Revenue", align: "right", numeric: true, adminOnly: true },
];

// Default visible set: the four CRUD fields + Jobs + Containers + Revenue.
const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  company: true,
  display_name: true,
  contact_email: true,
  phone: true,
  jobCount: true,
  totalContainers: true,
  totalRevenue: true,
};

const STORAGE_KEY = "clients-table-columns-v1";

// localStorage-backed column visibility via useSyncExternalStore — SSR renders
// DEFAULT_VISIBLE, the client hydrates from storage, and writes notify subscribers
// without a setState-in-effect. The snapshot is cached so getSnapshot stays stable
// (returning a fresh object each call would loop).
const columnStore = (() => {
  let cache: Record<ColumnKey, boolean> = DEFAULT_VISIBLE;
  const listeners = new Set<() => void>();

  function read(): Record<ColumnKey, boolean> {
    if (typeof window === "undefined") return DEFAULT_VISIBLE;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_VISIBLE, ...JSON.parse(raw) } : DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  }

  return {
    subscribe(cb: () => void) {
      // Refresh the cache once on first subscribe so the first client snapshot
      // reflects stored prefs (and differs from the SSR default if needed).
      cache = read();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      return cache;
    },
    getServerSnapshot() {
      return DEFAULT_VISIBLE;
    },
    toggle(key: ColumnKey) {
      const next = { ...cache, [key]: !cache[key] };
      cache = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / disabled storage
      }
      listeners.forEach((cb) => cb());
    },
  };
})();

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default function ClientsTable({
  clients,
  year,
}: {
  clients: ClientTableRow[];
  year: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = usePermissions();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");

  // Visible columns — SSR-safe localStorage subscription (see columnStore).
  const visible = useSyncExternalStore(
    columnStore.subscribe,
    columnStore.getSnapshot,
    columnStore.getServerSnapshot,
  );
  const [columnsOpen, setColumnsOpen] = useState(false);

  function toggleColumn(key: ColumnKey) {
    columnStore.toggle(key);
  }

  // Admins can see revenue; everyone else never gets the column at all.
  const activeColumns = useMemo(
    () => COLUMNS.filter((c) => (c.adminOnly ? isAdmin : true)),
    [isAdmin],
  );

  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The row whose active-switch request is in flight, so we can disable just it.
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function changeYear(y: number) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("year", String(y));
    startTransition(() => router.push(`/clients?${next.toString()}`));
  }

  function onSort(key: SortKey) {
    if (sort === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir("asc");
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? clients.filter((c) =>
          [label(c), c.name, c.company, c.contact_email, c.phone]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q)),
        )
      : clients;

    const def = COLUMNS.find((c) => c.key === sort);
    const numeric = def?.numeric ?? false;

    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sort === "name") {
        cmp = label(a).localeCompare(label(b));
      } else if (numeric) {
        cmp = (Number(a[sort] ?? 0)) - (Number(b[sort] ?? 0));
      } else {
        const av = (a[sort] as string | null) ?? "";
        const bv = (b[sort] as string | null) ?? "";
        cmp = av.localeCompare(bv);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [clients, search, sort, dir]);

  function openAdd() {
    setFormError(null);
    setModal({ mode: "add" });
  }

  function openEdit(row: ClientTableRow) {
    setFormError(null);
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
        router.refresh();
      }
    });
  }

  // Flip a client's active flag. Inactive clients stay in the backend and in this
  // list, but are filtered out of the consignment client dropdowns (which query
  // `.eq("is_active", true)`).
  function toggleActive(row: ClientTableRow) {
    setTogglingId(row.id);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("isActive", String(!row.is_active));
    startTransition(async () => {
      await setClientActiveAction(fd);
      setTogglingId(null);
      router.refresh();
    });
  }

  const colCount =
    1 + activeColumns.filter((c) => visible[c.key]).length + (isAdmin ? 2 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {clients.length.toLocaleString()} client{clients.length !== 1 ? "s" : ""} · {year}
          </p>
        </div>
        {isAdmin && (
          <button
            id="new-client-btn"
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New client
          </button>
        )}
      </div>

      {/* Toolbar: search + year + columns */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56 sm:w-64"
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Year
          <select
            value={year}
            onChange={(e) => changeYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {isPending && (
          <span
            className="text-xs text-muted-foreground flex items-center gap-1.5"
            aria-live="polite"
          >
            <span className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Updating…
          </span>
        )}

        <div className="ml-auto">
          <ColumnsMenu
            open={columnsOpen}
            onToggle={() => setColumnsOpen((o) => !o)}
            onClose={() => setColumnsOpen(false)}
            columns={activeColumns}
            visible={visible}
            onToggleColumn={toggleColumn}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className={[
          "rounded-xl border border-border overflow-hidden transition-opacity duration-150",
          isPending ? "opacity-60" : "opacity-100",
        ].join(" ")}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <SortHeader
                  column="name"
                  label="Name"
                  activeSort={sort}
                  activeDir={dir}
                  onSort={onSort}
                  align="left"
                />
                {activeColumns.map(
                  (c) =>
                    visible[c.key] && (
                      <SortHeader
                        key={c.key}
                        column={c.key}
                        label={c.label}
                        activeSort={sort}
                        activeDir={dir}
                        onSort={onSort}
                        align={c.align}
                      />
                    ),
                )}
                {isAdmin && (
                  <>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                      Active
                    </th>
                    <th className="px-4 py-2.5 w-12" />
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted-foreground">
                    No clients match.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/clients/${row.id}?year=${year}`)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{label(row)}</span>
                      {!row.is_active && (
                        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                          inactive
                        </span>
                      )}
                    </div>
                  </td>
                  {activeColumns.map(
                    (c) =>
                      visible[c.key] && (
                        <td
                          key={c.key}
                          className={[
                            "px-4 py-3 text-xs whitespace-nowrap",
                            c.align === "right"
                              ? "text-right font-mono tabular-nums text-foreground/80"
                              : "text-muted-foreground max-w-[180px] truncate",
                          ].join(" ")}
                        >
                          {renderCell(row, c)}
                        </td>
                      ),
                  )}
                  {isAdmin && (
                    <>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <ActiveSwitch
                          on={row.is_active}
                          disabled={togglingId === row.id}
                          onToggle={() => toggleActive(row)}
                          label={`${row.is_active ? "Deactivate" : "Activate"} ${label(row)}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Edit client"
                          onClick={() => openEdit(row)}
                          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                ? "Adds a consignee organisation. Displayed Name is shown across the app; it falls back to Name when blank."
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
                name="company"
                label="Company"
                placeholder="e.g. PAPA Trading Co. Ltd"
                defaultValue={modal.mode === "edit" ? (modal.row.company ?? "") : ""}
              />
              <ModalField
                name="display_name"
                label="Displayed Name"
                placeholder="e.g. PAPA — SAAJT"
                defaultValue={modal.mode === "edit" ? (modal.row.display_name ?? "") : ""}
              />
              <ModalField
                name="contact_email"
                label="Email"
                type="email"
                placeholder="optional"
                defaultValue={modal.mode === "edit" ? (modal.row.contact_email ?? "") : ""}
              />
              <ModalField
                name="phone"
                label="Phone Number"
                type="tel"
                placeholder="optional"
                defaultValue={modal.mode === "edit" ? (modal.row.phone ?? "") : ""}
              />
              <ModalField
                name="notes"
                label="Remark"
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
    </div>
  );
}

function renderCell(row: ClientTableRow, c: ColumnDef): React.ReactNode {
  switch (c.key) {
    case "totalRevenue":
      return row.totalRevenue != null ? formatTzs(row.totalRevenue) : "—";
    case "jobCount":
    case "totalContainers":
      return row[c.key];
    default: {
      const v = row[c.key] as string | null;
      return v?.trim() ? v : "—";
    }
  }
}

function SortHeader({
  column,
  label,
  activeSort,
  activeDir,
  onSort,
  align,
}: {
  column: SortKey;
  label: string;
  activeSort: SortKey;
  activeDir: SortDir;
  onSort: (column: SortKey) => void;
  align: "left" | "right";
}) {
  const active = activeSort === column;
  return (
    <th
      className={`px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={[
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" ? "flex-row-reverse" : "",
          active ? "text-foreground" : "",
        ].join(" ")}
        aria-label={`Sort by ${label}${active ? ` (${activeDir === "asc" ? "ascending" : "descending"})` : ""}`}
      >
        {label}
        <span className="text-[9px] leading-none w-2 inline-block">
          {active ? (activeDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function ColumnsMenu({
  open,
  onToggle,
  onClose,
  columns,
  visible,
  onToggleColumn,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  columns: ColumnDef[];
  visible: Record<ColumnKey, boolean>;
  onToggleColumn: (key: ColumnKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
          {columns.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onToggleColumn(c.key)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-muted transition-colors"
            >
              <span
                className={[
                  "flex h-4 w-4 items-center justify-center rounded border",
                  visible[c.key]
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border",
                ].join(" ")}
              >
                {visible[c.key] && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Toggle switch for a client's active flag. On = visible in consignment
// dropdowns; off = hidden there but kept in the backend and in this list.
function ActiveSwitch({
  on,
  disabled,
  onToggle,
  label,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-muted-foreground/30",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
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
