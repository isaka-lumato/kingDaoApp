"use client";

import { useState } from "react";
import type { DropPopupKind } from "@/lib/pipeline";
import { useColumnPermission } from "@/hooks/use-permissions";

export type IntakeIcd = { id: string; name: string; location: string | null };

type Props = {
  kind: DropPopupKind;
  refNo: string;
  /** ICDs for the Manifest popup's select. */
  icds: IntakeIcd[];
  /** Prefill for the Duty-Application popup. */
  defaultRef?: string | null;
  defaultTansad?: string | null;
  defaultUcr?: string | null;
  /** Prefill for the Release popup (D-073). */
  defaultEfdReceipt?: string | null;
  defaultAmount?: number | null;
  defaultRemarks?: string | null;
  /** Called with the validated intake payload to commit the advance. */
  onConfirm: (extra: Record<string, string>) => void;
  onCancel: () => void;
  isPending?: boolean;
};

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Blocking drop-popup (D-071). Collects the real-world data discovered when a
 * card first enters a stage, then hands it back to the board as an `extra`
 * payload — the board owns the single advance_stage call. Cancel leaves the
 * card where it was (the board never applied an optimistic move).
 *
 *  - "manifest": actual arrival date + ICD (New → Manifest Uploaded).
 *  - "duty_application": Ref No + TANSAD + UCR (entering Duty Application). Ref No
 *    defaults to the internal auto-generated ref_no but is operator-editable
 *    (OQ-1: editable-with-default).
 *  - "release": EFD receipt no + amount + remarks, captured at the final
 *    `release_status → 'Released'` step (D-073). All three are OPTIONAL — the
 *    popup prompts for the closing paperwork but never blocks a release, since
 *    a job can legitimately be released before it has been invoiced. A blank
 *    field sends no key at all, so it leaves the stored value untouched rather
 *    than nulling a figure entered earlier on the edit form.
 */
export default function IntakeDialog({
  kind,
  refNo,
  icds,
  defaultRef,
  defaultTansad,
  defaultUcr,
  defaultEfdReceipt,
  defaultAmount,
  defaultRemarks,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  const [arrivalDate, setArrivalDate] = useState("");
  const [icdId, setIcdId] = useState("");
  const [ref, setRef] = useState(defaultRef ?? refNo);
  const [tansad, setTansad] = useState(defaultTansad ?? "");
  const [ucr, setUcr] = useState(defaultUcr ?? "");
  const [efdReceipt, setEfdReceipt] = useState(defaultEfdReceipt ?? "");
  const [amount, setAmount] = useState(
    defaultAmount != null ? String(defaultAmount) : "",
  );
  const [remarks, setRemarks] = useState(defaultRemarks ?? "");
  const [error, setError] = useState<string | null>(null);

  // `amount` is gated by its own permission group ("Edit financial amounts" /
  // "See financial amounts"), separate from the pipeline-status write that
  // authorises the release itself. Hide the input unless this user can both see
  // and write it — advance_stage() re-checks and would 42501 the whole release
  // if we sent a key they can't write (CLAUDE.md §3: both layers must agree).
  const amountPerm = useColumnPermission("consignments", "amount");
  const canEditAmount = amountPerm.canRead && amountPerm.canWrite;

  const isManifest = kind === "manifest";
  const isRelease = kind === "release";
  const title = isRelease
    ? "Release details"
    : isManifest
      ? "Manifest details"
      : "Duty Application details";
  const subtitle = isRelease
    ? "Capture the closing paperwork. All fields are optional."
    : isManifest
      ? "Confirm the actual arrival and ICD to start processing."
      : "Enter the customs references to begin the duty application.";

  function handleConfirm() {
    setError(null);
    if (isManifest) {
      if (!arrivalDate) {
        setError("Please enter the actual arrival date.");
        return;
      }
      if (!icdId) {
        setError("Please select the ICD.");
        return;
      }
      onConfirm({ arrival_date: arrivalDate, icd_id: icdId });
      return;
    }
    if (isRelease) {
      // D-073: all optional. Only send the keys the operator actually filled in
      // — an omitted key leaves the column as-is (see the migration).
      const extra: Record<string, string> = {};
      if (efdReceipt.trim()) extra.efd_receipt_no = efdReceipt.trim();
      if (remarks.trim()) extra.remarks = remarks.trim();
      if (canEditAmount && amount.trim()) {
        // Whole shillings (D-017 — bigint column, no minor unit).
        const parsed = Number(amount);
        if (!Number.isInteger(parsed) || parsed < 0) {
          setError("Amount must be a whole number of shillings, 0 or more.");
          return;
        }
        extra.amount = String(parsed);
      }
      onConfirm(extra);
      return;
    }
    // Duty Application: Ref No required, TANSAD required, UCR optional (OQ-2).
    if (!ref.trim()) {
      setError("Please enter the Ref No.");
      return;
    }
    if (!tansad.trim()) {
      setError("Please enter the TANSAD number.");
      return;
    }
    const extra: Record<string, string> = { tansad_no: tansad.trim() };
    // Only send ref_no when the operator changed it from the current value —
    // avoids a no-op write (and a needless unique-index re-check).
    if (ref.trim() !== refNo) extra.ref_no = ref.trim();
    if (ucr.trim()) extra.ucr_no = ucr.trim();
    onConfirm(extra);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-muted-foreground text-sm mb-4">
          <span className="font-mono font-semibold text-foreground">{refNo}</span> — {subtitle}
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-4">
          {isRelease ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  EFD Receipt No
                </label>
                <input
                  type="text"
                  value={efdReceipt}
                  onChange={(e) => setEfdReceipt(e.target.value)}
                  placeholder="e.g. 03429118"
                  className={inputCls}
                  autoFocus
                />
              </div>
              {canEditAmount && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    Amount (TZS)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Whole shillings"
                    className={inputCls}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Remarks
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  placeholder="Any closing notes"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </>
          ) : isManifest ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Arrival date (actual) <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  ICD <span className="text-destructive">*</span>
                </label>
                <select
                  value={icdId}
                  onChange={(e) => setIcdId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select ICD…</option>
                  {icds.map((icd) => (
                    <option key={icd.id} value={icd.id}>
                      {icd.name}
                      {icd.location ? ` (${icd.location})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Ref No <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Reference number"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  TANSAD No <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={tansad}
                  onChange={(e) => setTansad(e.target.value)}
                  placeholder="e.g. TZ-2026-001234"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  UCR No
                </label>
                <input
                  type="text"
                  value={ucr}
                  onChange={(e) => setUcr(e.target.value)}
                  placeholder="Customs UCR (optional)"
                  className={inputCls}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={[
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity",
              // Green to match the release affordances elsewhere (D-049): the
              // card button and the drop zone.
              isRelease ? "bg-green-600" : "bg-primary text-primary-foreground",
            ].join(" ")}
          >
            {isPending ? "Saving…" : isRelease ? "Release ✓" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
