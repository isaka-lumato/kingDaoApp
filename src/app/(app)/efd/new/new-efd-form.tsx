"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createEfdAction } from "@/server/actions/efd";

type Candidate = {
  id: string;
  ref_no: string;
  year: number;
  bl_number: string | null;
  release_status: string;
  client_name: string | null;
};

type Props = { candidates: Candidate[]; preselectedIds?: string[] };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? "Creating…" : "Create EFD record"}
    </button>
  );
}

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function NewEfdForm({ candidates, preselectedIds = [] }: Props) {
  const [state, action] = useActionState(createEfdAction, null);
  const [efdCode, setEfdCode] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isTransit, setIsTransit] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedIds);

  // Derive flags from code (live preview — server re-applies on save).
  const upper = efdCode.trim().toUpperCase();
  const derivedPrivate = upper === "PRIVATE";
  const derivedTransit = upper === "TRANSIT";

  const filtered = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return candidates.slice(0, 50);
    return candidates
      .filter(
        (c) =>
          c.ref_no.toLowerCase().includes(q) ||
          (c.bl_number ?? "").toLowerCase().includes(q) ||
          (c.client_name ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [candidates, pickerQuery]);

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.includes(c.id)),
    [candidates, selectedIds]
  );

  const hasUnreleasedSelected = selectedCandidates.some(
    (c) => c.release_status !== "Released"
  );

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/efd"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Back to EFD records"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">New EFD record</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create a fiscal receipt and link it to one or more consignments.
          </p>
        </div>
      </div>

      {state?.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-6">
        <div className="rounded-xl border border-border p-5 space-y-4">
          <Field label="EFD code" required hint="TRA receipt number, or PRIVATE / TRANSIT.">
            <input
              name="efd_code"
              value={efdCode}
              onChange={(e) => setEfdCode(e.target.value)}
              required
              maxLength={40}
              className={`${inputCls} font-mono`}
              placeholder="03429118 or PRIVATE or TRANSIT"
            />
          </Field>

          <Field label="EFD time" hint="Time of issuance — HH:MM or HH:MM:SS.">
            <input
              name="efd_time"
              type="time"
              step={1}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_private"
                checked={derivedPrivate || isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                disabled={derivedPrivate}
              />
              <span>
                PRIVATE
                {derivedPrivate && (
                  <span className="text-[10px] text-muted-foreground ml-1">(auto)</span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_transit"
                checked={derivedTransit || isTransit}
                onChange={(e) => setIsTransit(e.target.checked)}
                disabled={derivedTransit}
              />
              <span>
                TRANSIT
                {derivedTransit && (
                  <span className="text-[10px] text-muted-foreground ml-1">(auto)</span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={selectedIds.length >= 2} disabled readOnly />
              <span>
                SHARED
                <span className="text-[10px] ml-1">(auto from link count)</span>
              </span>
            </label>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              className={inputCls}
              placeholder="Optional — internal notes about this receipt."
            />
          </Field>
        </div>

        {/* Consignment picker */}
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Link consignments</h2>
              <p className="text-xs text-muted-foreground">
                {selectedIds.length} selected. Search by ref no, B/L, or client.
              </p>
            </div>
            <input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search…"
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
            />
          </div>

          {hasUnreleasedSelected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ One or more selected consignments are not yet Released. EFDs are
              typically issued after release — proceed if this is intentional.
            </div>
          )}

          {/* Hidden inputs so FormData carries the selection */}
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="consignment_ids" value={id} />
          ))}

          <div className="rounded-lg border border-border max-h-72 overflow-y-auto divide-y divide-border">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matching consignments.
              </div>
            )}
            {filtered.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="font-mono font-bold text-xs">{c.ref_no}</span>
                  <span className="text-[10px] text-muted-foreground">{c.year}</span>
                  <span className="text-muted-foreground flex-1 truncate">
                    {c.client_name ?? "—"} · {c.bl_number ?? "no B/L"}
                  </span>
                  <span
                    className={[
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                      c.release_status === "Released"
                        ? "bg-stage-done/15 text-stage-done border-stage-done/30"
                        : "bg-stage-waiting/15 text-stage-waiting border-stage-waiting/30",
                    ].join(" ")}
                  >
                    {c.release_status}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/efd"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
