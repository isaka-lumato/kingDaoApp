"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  isStageComplete,
  isNewConsignment,
  gatedPopupForForwardMove,
  resolveActiveStage,
  STAGE_FIELDS,
  type StageField,
  type KanbanConsignment,
  type DropPopupKind,
} from "@/lib/pipeline";
import { advanceStageAction } from "@/server/actions/consignments";
import { usePermissions, useColumnPermission } from "@/hooks/use-permissions";
import ForceStageDialog from "./force-stage-dialog";
import IntakeDialog, { type IntakeIcd } from "./intake-dialog";

type Props = {
  consignment: Pick<
    KanbanConsignment,
    | "id"
    | "ref_no"
    | "client_name"
    | "active_stage"
    | "consignment_nature"
    | "arrival_date"
    | "tansad_no"
    | "ucr_no"
    | "manifest_status"
    | "shipping_batch_status"
    | "tanesws_status"
    | "assessment_status"
    | "tbs_loading_status"
    | "tbs_debit_status"
    | "manifest_comp_status"
    | "duty_status"
    | "inspection_file_status"
    | "release_status"
  >;
  /** Stage the menu targets. Defaults to the row's active stage. */
  targetStage?: StageField;
  /** ICDs for the Manifest drop-popup (D-071). */
  icds?: IntakeIcd[];
  /** Called after a successful action so the host can close the drawer/popover. */
  onActionComplete?: () => void;
};

// The "default" non-Waiting, non-Done value to surface as a quick "Set to Action".
// Stages with intermediates surface those as additional rows.
function intermediateValues(field: StageField): string[] {
  const def = PIPELINE_STAGES.find((s) => s.field === field)!;
  return def.validValues.filter(
    (v) => v !== "Waiting" && v !== "Action" && v !== def.doneValue,
  );
}

export default function StageActionMenu({
  consignment,
  targetStage,
  icds = [],
  onActionComplete,
}: Props) {
  const perms = usePermissions();
  const stageField: StageField = targetStage ?? consignment.active_stage;
  const stageDef = PIPELINE_STAGES.find((s) => s.field === stageField)!;
  const currentValue = consignment[stageField] as string;
  const isDone = isStageComplete(stageField, currentValue);

  // Advancing writes the target stage's status column; gate on write access to
  // that column, matching advance_stage()'s DB-side permission check (D-063).
  const { canWrite } = useColumnPermission("consignments", stageField);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [forceOpen, setForceOpen] = useState(false);
  // D-071: pending gated advance awaiting the drop-popup's intake fields.
  const [gate, setGate] = useState<{ kind: DropPopupKind; newValue: string } | null>(null);

  const isNew = isNewConsignment(consignment);

  function runAdvance(newValue: string, extra?: Record<string, string>) {
    setError(null);
    const fd = new FormData();
    fd.set("consignmentId", consignment.id);
    fd.set("stage", stageField);
    fd.set("newValue", newValue);
    if (extra) fd.set("extra", JSON.stringify(extra));
    startTransition(async () => {
      const res = await advanceStageAction(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onActionComplete?.();
    });
  }

  // Decide whether advancing the current stage needs a blocking popup (D-071).
  function callAdvance(newValue: string) {
    // A New card's only forward move is New → Manifest (via the Manifest popup).
    if (isNew && stageField === "manifest_status") {
      setGate({ kind: "manifest", newValue: "Action" });
      return;
    }
    if (stageField === consignment.active_stage) {
      const stageValues: Record<string, string> = {};
      for (const f of STAGE_FIELDS) stageValues[f] = consignment[f] as string;
      stageValues[stageField] = newValue;
      const landingStage = resolveActiveStage(stageValues, consignment.consignment_nature);
      const popup = gatedPopupForForwardMove(consignment, stageField, landingStage);
      if (popup === "duty_application") {
        setGate({ kind: "duty_application", newValue });
        return;
      }
    }
    runAdvance(newValue);
  }

  const intermediates = intermediateValues(stageField);

  return (
    <div className="flex flex-col gap-1 p-2 min-w-[260px]">
      <div className="px-2 pt-1 pb-2 border-b border-border/60">
        <p className="text-xs text-muted-foreground">{consignment.client_name}</p>
        <p className="font-mono text-sm font-bold text-foreground">
          {consignment.ref_no}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Stage: <span className="text-foreground">{stageDef.label}</span>{" "}
          <span className="text-foreground/60">· {currentValue}</span>
        </p>
      </div>

      {error && (
        <div className="mx-1 my-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {canWrite && !isDone && (
        <>
          <MenuButton
            onClick={() => callAdvance(STAGE_DONE_VALUE[stageField])}
            disabled={isPending}
            primary
          >
            ✓ Mark <strong>{stageDef.label}</strong> {STAGE_DONE_VALUE[stageField]}
          </MenuButton>
          {currentValue !== "Action" && (
            <MenuButton
              onClick={() => callAdvance("Action")}
              disabled={isPending}
            >
              ⚡ Set to Action
            </MenuButton>
          )}
          {intermediates
            .filter((v) => v !== currentValue)
            .map((v) => (
              <MenuButton
                key={v}
                onClick={() => callAdvance(v)}
                disabled={isPending}
              >
                Set to {v}
              </MenuButton>
            ))}
        </>
      )}

      {canWrite && perms.isAdmin && (
        <MenuButton
          onClick={() => setForceOpen(true)}
          disabled={isPending}
          variant="danger"
        >
          ⚠ Move to a different stage…
        </MenuButton>
      )}

      <Link
        href={`/consignments/${consignment.id}`}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
        onClick={onActionComplete}
      >
        Open detail →
      </Link>

      <ForceStageDialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        consignmentId={consignment.id}
        refNo={consignment.ref_no}
        defaultStage={stageField}
        defaultValue="Action"
        onSuccess={onActionComplete}
        onError={setError}
      />

      {/* Blocking drop-popup for gated tap-to-advance (D-071). Cancel discards
          the pending advance; the row stays put. */}
      {gate && (
        <IntakeDialog
          kind={gate.kind}
          refNo={consignment.ref_no}
          icds={icds}
          defaultRef={consignment.ref_no}
          defaultTansad={consignment.tansad_no ?? null}
          defaultUcr={consignment.ucr_no ?? null}
          onConfirm={(extra) => {
            runAdvance(gate.newValue, extra);
            setGate(null);
          }}
          onCancel={() => setGate(null)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
  primary,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  variant?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "text-left text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90 font-semibold"
          : variant === "danger"
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
