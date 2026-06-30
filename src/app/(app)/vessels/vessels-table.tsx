"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVesselAction,
  updateVesselAction,
  setVesselActiveAction,
  deleteVesselAction,
} from "@/server/actions/settings-reference";

export type VesselTableRow = {
  id: string;
  name: string;
  is_active: boolean;
  consignmentCount: number;
};

type ModalState = { mode: "add" } | { mode: "edit"; row: VesselTableRow } | null;

type SortKey = "name" | "consignmentCount";
type SortDir = "asc" | "desc";

export default function VesselsTable({
  vessels,
  isAdmin,
}: {
  vessels: VesselTableRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");

  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function onSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? vessels.filter((v) => v.name.toLowerCase().includes(q))
      : vessels;

    const sorted = [...filtered].sort((a, b) => {
      const cmp =
        sort === "consignmentCount"
          ? a.consignmentCount - b.consignmentCount
          : a.name.localeCompare(b.name);
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [vessels, search, sort, dir]);

  function openAdd() {
    setFormError(null);
    setModal({ mode: "add" });
  }
  function openEdit(row: VesselTableRow) {
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
    const action = modal.mode === "add" ? createVesselAction : updateVesselAction;
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

  function toggleActive(row: VesselTableRow) {
    setTogglingId(row.id);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("isActive", String(!row.is_active));
    startTransition(async () => {
      await setVesselActiveAction(fd);
      setTogglingId(null);
      router.refresh();
    });
  }

  function handleDelete(row: VesselTableRow) {
    if (
      !window.confirm(
        `Delete vessel "${row.name}"? This can't be undone from the UI.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      const res = await deleteVesselAction(fd);
      if (res && "error" in res && res.error) {
        window.alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  const colCount = 2 + (isAdmin ? 2 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Vessels</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {vessels.length.toLocaleString()} vessel{vessels.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <button
            id="new-vessel-btn"
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New vessel
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vessels…"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56 sm:w-64"
        />
        {isPending && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5" aria-live="polite">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Updating…
          </span>
        )}
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
                <SortHeader column="name" label="Name" activeSort={sort} activeDir={dir} onSort={onSort} align="left" />
                <SortHeader column="consignmentCount" label="Consignments" activeSort={sort} activeDir={dir} onSort={onSort} align="right" />
                {isAdmin && (
                  <>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">Active</th>
                    <th className="px-4 py-2.5 w-20" />
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted-foreground">
                    No vessels match.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/vessels/${row.id}`)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.name}</span>
                      {!row.is_active && (
                        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                          inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-right font-mono tabular-nums text-foreground/80">
                    {row.consignmentCount}
                  </td>
                  {isAdmin && (
                    <>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <ActiveSwitch
                          on={row.is_active}
                          disabled={togglingId === row.id}
                          onToggle={() => toggleActive(row)}
                          label={`${row.is_active ? "Deactivate" : "Activate"} ${row.name}`}
                        />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Edit vessel"
                            onClick={() => openEdit(row)}
                            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Delete vessel"
                            onClick={() => handleDelete(row)}
                            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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
              {modal.mode === "add" ? "New vessel" : "Edit vessel"}
            </h3>
            <p className="text-muted-foreground text-sm mb-5">
              {modal.mode === "add"
                ? "Adds a vessel to the curated list suggested in the consignment form."
                : "Update this vessel's name."}
            </p>

            {formError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <form key={modal.mode === "edit" ? modal.row.id : "add"} onSubmit={handleSubmit} className="space-y-4">
              {modal.mode === "edit" && <input type="hidden" name="id" value={modal.row.id} />}
              <div className="space-y-1.5">
                <label htmlFor="vessel-field-name" className="block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="vessel-field-name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. MSC ANNA"
                  defaultValue={modal.mode === "edit" ? modal.row.name : ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
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
                  {isPending ? "Saving…" : modal.mode === "add" ? "Create vessel" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
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
