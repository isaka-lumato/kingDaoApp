"use client";

import { useState } from "react";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  type StageField,
  type KanbanConsignment,
  type DropPopupKind,
} from "@/lib/pipeline";
import { useColumnPermission } from "@/hooks/use-permissions";
import type { IntakeIcd } from "@/components/intake-dialog";

type Props = {
  consignment: KanbanConsignment;
  currentStage: StageField;
  targetValue: string;
  landingStage: StageField;
  popupKind: DropPopupKind | null;
  icds?: IntakeIcd[];
  onConfirm: (extra?: Record<string, string>) => void;
  onCancel: () => void;
  isPending?: boolean;
};

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function StageConfirmDialog({
  consignment,
  currentStage,
  targetValue,
  landingStage,
  popupKind,
  icds = [],
  onConfirm,
  onCancel,
  isPending = false,
}: Props) {
  // Intake field states
  const [arrivalDate, setArrivalDate] = useState(consignment.arrival_date ?? "");
  const [icdId, setIcdId] = useState("");
  const [ref, setRef] = useState(consignment.ref_no);
  const [tansad, setTansad] = useState(consignment.tansad_no ?? "");
  const [ucr, setUcr] = useState(consignment.ucr_no ?? "");
  const [efdReceipt, setEfdReceipt] = useState(consignment.efd_receipt_no ?? "");
  const [amount, setAmount] = useState(
    consignment.amount != null ? String(consignment.amount) : ""
  );
  const [remarks, setRemarks] = useState(consignment.remarks ?? "");
  const [error, setError] = useState<string | null>(null);

  // Permission for editing financial amount at release
  const amountPerm = useColumnPermission("consignments", "amount");
  const canEditAmount = amountPerm.canRead && amountPerm.canWrite;

  const currentStageDef = PIPELINE_STAGES.find((s) => s.field === currentStage);
  const landingStageDef = PIPELINE_STAGES.find((s) => s.field === landingStage);

  const isManifest = popupKind === "manifest";
  const isDutyApp = popupKind === "duty_application";
  const isRelease = popupKind === "release" || currentStage === "release_status";

  function handleConfirm() {
    setError(null);

    if (isManifest) {
      if (!arrivalDate) {
        setError("Please enter the actual arrival date.");
        return;
      }
      if (!icdId) {
        setError("Please select the destination ICD.");
        return;
      }
      onConfirm({ arrival_date: arrivalDate, icd_id: icdId });
      return;
    }

    if (isDutyApp) {
      if (!ref.trim()) {
        setError("Please enter the Ref No.");
        return;
      }
      if (!tansad.trim()) {
        setError("Please enter the TANSAD declaration number.");
        return;
      }
      const extra: Record<string, string> = { tansad_no: tansad.trim() };
      if (ref.trim() !== consignment.ref_no) extra.ref_no = ref.trim();
      if (ucr.trim()) extra.ucr_no = ucr.trim();
      onConfirm(extra);
      return;
    }

    if (isRelease) {
      const extra: Record<string, string> = {};
      if (efdReceipt.trim()) extra.efd_receipt_no = efdReceipt.trim();
      if (remarks.trim()) extra.remarks = remarks.trim();
      if (canEditAmount && amount.trim()) {
        const parsed = Number(amount);
        if (!Number.isInteger(parsed) || parsed < 0) {
          setError("Amount must be a whole number of shillings, 0 or more.");
          return;
        }
        extra.amount = String(parsed);
      }
      onConfirm(Object.keys(extra).length > 0 ? extra : undefined);
      return;
    }

    // Standard confirmation (no intake data required)
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {isRelease
                ? "Confirm Consignment Release"
                : isManifest
                  ? "Confirm Manifest Entry"
                  : isDutyApp
                    ? "Duty Application Details"
                    : "Confirm Stage Advance"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono font-semibold text-foreground">
                {consignment.ref_no}
              </span>{" "}
              · {consignment.client_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-lg leading-none p-1 rounded-md transition-colors"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Progression Card */}
        <div className="rounded-lg border border-border bg-muted/30 p-3.5 mb-4">
          <div className="grid grid-cols-7 items-center gap-2 text-center text-xs">
            <div className="col-span-3 text-left">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground block">
                Current Stage
              </span>
              <span className="font-medium text-foreground block truncate mt-0.5">
                {currentStageDef?.label ?? currentStage}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5 block">
                Completing ({targetValue})
              </span>
            </div>

            <div className="col-span-1 flex justify-center text-muted-foreground font-bold">
              ➔
            </div>

            <div className="col-span-3 text-right">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground block">
                Next Stage
              </span>
              <span className="font-medium text-foreground block truncate mt-0.5">
                {isRelease
                  ? "Fully Released"
                  : (landingStageDef?.label ?? landingStage)}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 block">
                {isRelease ? "Terminal" : "Ready for Action"}
              </span>
            </div>
          </div>
        </div>

        {/* Prompt description */}
        <p className="text-xs text-muted-foreground mb-4">
          {isRelease
            ? "Releasing this consignment will officially authorize release from the ICD and close out the job."
            : isManifest
              ? "Confirm actual vessel arrival and assigned ICD to begin processing."
              : isDutyApp
                ? "Enter the TANSAD customs declaration number to proceed with duty application."
                : `Are you sure you want to mark "${currentStageDef?.label}" as ${targetValue} and advance this job?`}
        </p>

        {/* Specific intake form fields */}
        {isManifest && (
          <div className="space-y-3 mb-4 border-t border-border/60 pt-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Actual Arrival Date <span className="text-destructive">*</span>
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
              <label className="block text-xs font-medium text-foreground">
                Destination ICD Yard <span className="text-destructive">*</span>
              </label>
              <select
                value={icdId}
                onChange={(e) => setIcdId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select ICD…</option>
                {icds.map((icd) => (
                  <option key={icd.id} value={icd.id}>
                    {icd.name} {icd.location ? `(${icd.location})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {isDutyApp && (
          <div className="space-y-3 mb-4 border-t border-border/60 pt-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Ref No (Customs reference) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                TANSAD Declaration Number <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={tansad}
                onChange={(e) => setTansad(e.target.value)}
                placeholder="e.g. 2026-DAR-..."
                className={inputCls}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                UCR Number (Optional)
              </label>
              <input
                type="text"
                value={ucr}
                onChange={(e) => setUcr(e.target.value)}
                placeholder="Optional UCR reference"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {isRelease && (
          <div className="space-y-3 mb-4 border-t border-border/60 pt-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                EFD Receipt No (Optional)
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
                <label className="block text-xs font-medium text-foreground">
                  Service Amount (TZS)
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
              <label className="block text-xs font-medium text-foreground">
                Release Remarks
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                placeholder="Closing notes / release remarks"
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel (No change)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
          >
            {isPending ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Updating…
              </>
            ) : (
              <>✓ Confirm & Advance</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
