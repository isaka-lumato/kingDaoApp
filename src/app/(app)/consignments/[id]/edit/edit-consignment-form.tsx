"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { editConsignmentAction } from "@/server/actions/edit-consignment";

type Client = { id: string; name: string };
type ICD = { id: string; name: string; code: string };
type Consignment = {
  id: string;
  ref_no: string;
  year: number;
  client_id: string | null;
  bl_number: string | null;
  tansad_no: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  container_count: number | null;
  container_type: string | null;
  goods_description: string | null;
  icd_id: string | null;
  amount: number | null;
  remarks: string | null;
};

type Props = {
  consignment: Consignment;
  clients: Client[];
  icds: ICD[];
  canWrite: (col: string) => boolean;
};

const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "LCL", "BULK"] as const;

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function Field({
  label,
  col,
  canWrite,
  children,
}: {
  label: string;
  col: string;
  canWrite: (col: string) => boolean;
  children: (disabled: boolean) => React.ReactNode;
}) {
  const disabled = !canWrite(col);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="block text-sm font-medium text-foreground">{label}</label>
        {disabled && (
          <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
            read-only
          </span>
        )}
      </div>
      {children(disabled)}
    </div>
  );
}

export default function EditConsignmentForm({ consignment, clients, icds, canWrite }: Props) {
  const [state, action] = useActionState(editConsignmentAction, null);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/consignments/${consignment.id}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Edit{" "}
            <span className="font-mono">{consignment.ref_no}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Fields marked <span className="text-muted-foreground font-medium">read-only</span> are restricted by your role.
          </p>
        </div>
      </div>

      {state && "error" in state && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state && "success" in state && state.success && (
        <div className="rounded-lg border border-stage-done/30 bg-stage-done/10 px-4 py-3 text-sm text-stage-done">
          ✓ Consignment updated successfully.
        </div>
      )}

      <form action={action} className="space-y-6">
        <input type="hidden" name="id" value={consignment.id} />

        {/* Core details */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Core details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client" col="client_id" canWrite={canWrite}>
              {(disabled) => (
                <select
                  name="client_id"
                  defaultValue={consignment.client_id ?? ""}
                  disabled={disabled}
                  className={inputCls}
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="ICD" col="icd_id" canWrite={canWrite}>
              {(disabled) => (
                <select
                  name="icd_id"
                  defaultValue={consignment.icd_id ?? ""}
                  disabled={disabled}
                  className={inputCls}
                >
                  <option value="">Select ICD…</option>
                  {icds.map((icd) => (
                    <option key={icd.id} value={icd.id}>
                      {icd.name} ({icd.code})
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Goods description" col="goods_description" canWrite={canWrite}>
              {(disabled) => (
                <textarea
                  name="goods_description"
                  defaultValue={consignment.goods_description ?? ""}
                  disabled={disabled}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              )}
            </Field>

            <Field label="Amount (TZS)" col="amount" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="amount"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={consignment.amount ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Vessel & shipping */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vessel &amp; shipping
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="B/L Number" col="bl_number" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="bl_number"
                  type="text"
                  defaultValue={consignment.bl_number ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label="TANSAD No" col="tansad_no" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="tansad_no"
                  type="text"
                  defaultValue={consignment.tansad_no ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label="Vessel name" col="vessel_name" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="vessel_name"
                  type="text"
                  defaultValue={consignment.vessel_name ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label="Arrival date" col="arrival_date" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="arrival_date"
                  type="date"
                  defaultValue={consignment.arrival_date ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label="Container count" col="container_count" canWrite={canWrite}>
              {(disabled) => (
                <input
                  name="container_count"
                  type="number"
                  min={1}
                  defaultValue={consignment.container_count ?? ""}
                  disabled={disabled}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label="Container type" col="container_type" canWrite={canWrite}>
              {(disabled) => (
                <select
                  name="container_type"
                  defaultValue={consignment.container_type ?? ""}
                  disabled={disabled}
                  className={inputCls}
                >
                  <option value="">Select type…</option>
                  {CONTAINER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </section>

        {/* Remarks */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Remarks
          </h2>
          <Field label="Internal remarks" col="remarks" canWrite={canWrite}>
            {(disabled) => (
              <textarea
                name="remarks"
                defaultValue={consignment.remarks ?? ""}
                disabled={disabled}
                rows={3}
                className={`${inputCls} resize-none`}
              />
            )}
          </Field>
        </section>

        <div className="flex items-center gap-3 justify-end pb-8">
          <Link
            href={`/consignments/${consignment.id}`}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
