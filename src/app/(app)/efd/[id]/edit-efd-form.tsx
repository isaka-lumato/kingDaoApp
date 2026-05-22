"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateEfdAction,
  deleteEfdAction,
  linkConsignmentsAction,
  unlinkConsignmentAction,
} from "@/server/actions/efd";

type Linked = {
  id: string;
  ref_no: string;
  year: number;
  bl_number: string | null;
  release_status: string;
  client_name: string | null;
  linked_at: string;
};

type Candidate = {
  id: string;
  ref_no: string;
  year: number;
  bl_number: string | null;
  release_status: string;
  client_name: string | null;
};

type Efd = {
  id: string;
  efd_code: string;
  efd_time: string | null;
  is_private: boolean;
  is_transit: boolean;
  is_shared: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  efd: Efd;
  linkedConsignments: Linked[];
  candidates: Candidate[];
  canWrite: boolean;
  isAdmin: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function EditEfdForm({
  efd,
  linkedConsignments,
  candidates,
  canWrite,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [state, action] = useActionState(updateEfdAction, null);
  const [isPending, startTransition] = useTransition();
  const [efdCode, setEfdCode] = useState(efd.efd_code);
  const [isPrivate, setIsPrivate] = useState(efd.is_private);
  const [isTransit, setIsTransit] = useState(efd.is_transit);
  const [pickerQuery, setPickerQuery] = useState("");
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

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

  function toggleAdd(id: string) {
    setToAdd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleAddLinks() {
    if (toAdd.length === 0) return;
    setActionError(null);
    startTransition(async () => {
      const result = await linkConsignmentsAction(efd.id, toAdd);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setToAdd([]);
      router.refresh();
    });
  }

  function handleUnlink(consignmentId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await unlinkConsignmentAction(efd.id, consignmentId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete EFD record ${efd.efd_code}? This cannot be undone.`)) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteEfdAction(efd.id);
      if (result?.error) setActionError(result.error);
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/efd"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Back to EFD records"
          >
            ←
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">
              {efd.efd_code}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Created {new Date(efd.created_at).toLocaleString("en-GB")}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-60 transition-colors"
          >
            Delete record
          </button>
        )}
      </div>

      {state && "error" in state && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state && "success" in state && state.success && (
        <div className="rounded-lg border border-stage-done/30 bg-stage-done/10 px-4 py-3 text-sm text-stage-done">
          Saved.
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Edit form */}
      <form action={action} className="rounded-xl border border-border p-5 space-y-4">
        <input type="hidden" name="id" value={efd.id} />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">EFD code</label>
          <input
            name="efd_code"
            value={efdCode}
            onChange={(e) => setEfdCode(e.target.value)}
            disabled={!canWrite}
            required
            maxLength={40}
            className={`${inputCls} font-mono disabled:opacity-60`}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">EFD time</label>
          <input
            name="efd_time"
            type="time"
            step={1}
            defaultValue={efd.efd_time ?? ""}
            disabled={!canWrite}
            className={`${inputCls} disabled:opacity-60`}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_private"
              checked={derivedPrivate || isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              disabled={!canWrite || derivedPrivate}
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
              disabled={!canWrite || derivedTransit}
            />
            <span>
              TRANSIT
              {derivedTransit && (
                <span className="text-[10px] text-muted-foreground ml-1">(auto)</span>
              )}
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={efd.is_shared} disabled readOnly />
            <span>
              SHARED
              <span className="text-[10px] ml-1">
                ({linkedConsignments.length} linked)
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={efd.notes ?? ""}
            disabled={!canWrite}
            className={`${inputCls} disabled:opacity-60`}
          />
        </div>

        {canWrite && (
          <div className="flex justify-end">
            <SaveButton />
          </div>
        )}
      </form>

      {/* Linked consignments */}
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">Linked consignments</h2>
          <p className="text-xs text-muted-foreground">
            {linkedConsignments.length} consignment{linkedConsignments.length === 1 ? "" : "s"} linked to this EFD.
          </p>
        </div>

        {linkedConsignments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No consignments linked yet.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {linkedConsignments.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Link
                  href={`/consignments/${c.id}`}
                  className="font-mono font-bold text-xs text-brand hover:underline"
                >
                  {c.ref_no}
                </Link>
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
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(c.id)}
                    disabled={isPending}
                    className="text-xs text-destructive hover:underline disabled:opacity-60"
                  >
                    Unlink
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-sm">Add consignments</h3>
                <p className="text-xs text-muted-foreground">
                  {toAdd.length} selected. Search by ref no, B/L, or client.
                </p>
              </div>
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search…"
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
              />
            </div>

            <div className="rounded-lg border border-border max-h-64 overflow-y-auto divide-y divide-border">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No more consignments to link.
                </div>
              )}
              {filtered.map((c) => {
                const checked = toAdd.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAdd(c.id)}
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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddLinks}
                disabled={isPending || toAdd.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {isPending ? "Linking…" : `Link ${toAdd.length || ""} consignment${toAdd.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
