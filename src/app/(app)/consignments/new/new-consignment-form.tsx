"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createConsignmentAction } from "@/server/actions/create-consignment";

type Props = {
  clients: { id: string; name: string }[];
  icds: { id: string; name: string; location: string | null }[];
};

const CONTAINER_TYPES = ["40FT", "20FT", "CAR", "COIL"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? "Creating…" : "Create consignment"}
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

export default function NewConsignmentForm({ clients, icds }: Props) {
  const [state, action] = useActionState(createConsignmentAction, null);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/consignments"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Back to consignments"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">New consignment</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            All pipeline stages start at Waiting. Advance them from the Kanban board.
          </p>
        </div>
      </div>

      {state?.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Section: Core details */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Core details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client" required>
              <select name="client_id" required className={inputCls}>
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Year" required>
              <select name="year" defaultValue={CURRENT_YEAR} required className={inputCls}>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Goods description">
            <textarea
              name="goods_description"
              rows={2}
              placeholder="e.g. 1 x 40GP Container of Textile Products"
              className={`${inputCls} resize-none`}
            />
          </Field>
        </section>

        {/* Section: Vessel & logistics */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Vessel &amp; logistics
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="B/L Number">
              <input
                name="bl_number"
                type="text"
                placeholder="e.g. HLBU1234567"
                className={inputCls}
              />
            </Field>

            <Field label="TANSAD No">
              <input
                name="tansad_no"
                type="text"
                placeholder="e.g. TZ-2024-001234"
                className={inputCls}
              />
            </Field>

            <Field label="Vessel name">
              <input
                name="vessel_name"
                type="text"
                placeholder="e.g. MSC ANNA"
                className={inputCls}
              />
            </Field>

            <Field label="Arrival date">
              <input
                name="arrival_date"
                type="date"
                className={inputCls}
              />
            </Field>

            <Field label="Container count">
              <input
                name="container_count"
                type="number"
                min={1}
                placeholder="e.g. 2"
                className={inputCls}
              />
            </Field>

            <Field label="Container type">
              <select name="container_type" className={inputCls}>
                <option value="">Select type…</option>
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="ICD">
              <select name="icd_id" className={inputCls}>
                <option value="">Select ICD…</option>
                {icds.map((icd) => (
                  <option key={icd.id} value={icd.id}>
                    {icd.name}{icd.location ? ` (${icd.location})` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Amount (TZS)" hint="Customs duty / declared value">
              <input
                name="amount"
                type="number"
                min={0}
                step={1000}
                placeholder="e.g. 1500000"
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* Section: Remarks */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Remarks
          </h2>
          <Field label="Internal remarks">
            <textarea
              name="remarks"
              rows={3}
              placeholder="Any internal notes about this consignment…"
              className={`${inputCls} resize-none`}
            />
          </Field>
        </section>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pb-8">
          <Link
            href="/consignments"
            className="w-full sm:w-auto text-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
