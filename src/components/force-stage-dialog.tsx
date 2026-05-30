"use client";

import { useState, useTransition } from "react";
import { PIPELINE_STAGES, type StageField } from "@/lib/pipeline";
import { forceSetStageAction } from "@/server/actions/consignments";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consignmentId: string;
  refNo: string;
  /** Stage being force-set (pre-selected from the action menu). */
  defaultStage: StageField;
  /** Value to set the stage to (e.g. "Action"). */
  defaultValue: string;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
};

export default function ForceStageDialog({
  open,
  onOpenChange,
  consignmentId,
  refNo,
  defaultStage,
  defaultValue,
  onSuccess,
  onError,
}: Props) {
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<StageField>(defaultStage);
  const [newValue, setNewValue] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const stageDef = PIPELINE_STAGES.find((s) => s.field === stage)!;

  function close() {
    onOpenChange(false);
    setReason("");
    setStage(defaultStage);
    setNewValue(defaultValue);
  }

  function handleConfirm() {
    if (!reason.trim()) return;
    const fd = new FormData();
    fd.set("consignmentId", consignmentId);
    fd.set("stage", stage);
    fd.set("newValue", newValue);
    fd.set("reason", reason);
    startTransition(async () => {
      const res = await forceSetStageAction(fd);
      if (res?.error) {
        onError?.(res.error);
        return;
      }
      close();
      onSuccess?.();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          ⚠️ Move to a different stage
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
          Moving <strong>{refNo}</strong> bypasses pipeline prerequisites. This action is logged.
        </p>

        <div className="space-y-3 mb-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Stage
            </label>
            <select
              value={stage}
              onChange={(e) => {
                const next = e.target.value as StageField;
                setStage(next);
                const def = PIPELINE_STAGES.find((s) => s.field === next)!;
                setNewValue(def.validValues.includes("Action") ? "Action" : def.validValues[0]);
              }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.field} value={s.field}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              New value
            </label>
            <select
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {stageDef.validValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Data entry correction — wrong stage was set"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!reason.trim() || isPending}
            className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Saving…" : "Confirm move"}
          </button>
        </div>
      </div>
    </div>
  );
}
