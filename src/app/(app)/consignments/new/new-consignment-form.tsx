"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createConsignmentAction } from "@/server/actions/create-consignment";
import { useInvalidateConsignments } from "@/hooks/use-invalidate-consignments";
import { CARGO_TYPES, cargoLabel } from "@/lib/cargo";
import { CONSIGNMENT_NATURES } from "@/lib/pipeline";
import {
  createClientAction,
  createVesselAction,
} from "@/server/actions/settings-reference";

type Props = {
  clients: { id: string; name: string; display_name: string | null }[];
  vessels: string[];
};

function clientLabel(c: { name: string; display_name: string | null }) {
  return c.display_name?.trim() || c.name;
}

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
  error,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function NewConsignmentForm({ clients, vessels }: Props) {
  const invalidateConsignments = useInvalidateConsignments();
  // The action redirects on success, so it never resolves here — invalidate
  // before calling (D-072). `refetchType: "active"` only flags the unmounted
  // grid stale rather than refetching now, so the new row can't be missed.
  const [state, action] = useActionState(
    async (
      prev: Parameters<typeof createConsignmentAction>[0],
      fd: FormData,
    ) => {
      invalidateConsignments();
      return createConsignmentAction(prev, fd);
    },
    null,
  );
  const errs = state?.fieldErrors ?? {};

  // Local state for dynamically populated lists
  const [localClients, setLocalClients] = useState(clients);
  const [localVessels, setLocalVessels] = useState(vessels);

  // Controlled fields to allow programmatic selection after creation
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedVessel, setSelectedVessel] = useState("");

  // Modal control
  const [activeModal, setActiveModal] = useState<"client" | "vessel" | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal form states
  const [newClientName, setNewClientName] = useState("");
  const [newClientDisplayName, setNewClientDisplayName] = useState("");
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");

  const [newVesselName, setNewVesselName] = useState("");

  function resetModalStates() {
    setModalError(null);
    setModalSubmitting(false);
    setActiveModal(null);
    // Client
    setNewClientName("");
    setNewClientDisplayName("");
    setNewClientCompany("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientNotes("");
    // Vessel
    setNewVesselName("");
  }

  async function handleCreateClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const fd = new FormData(e.currentTarget);
    const res = await createClientAction(fd);

    if (res && "error" in res && res.error) {
      setModalError(res.error);
      setModalSubmitting(false);
    } else if (res && "success" in res && res.success && res.data) {
      // Typecast or guarantee shape
      const newClient = res.data as { id: string; name: string; display_name: string | null };
      setLocalClients((prev) => [...prev, newClient]);
      setSelectedClient(newClient.id);
      resetModalStates();
    } else {
      setModalError("Something went wrong while creating client.");
      setModalSubmitting(false);
    }
  }

  async function handleCreateVessel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const fd = new FormData(e.currentTarget);
    const res = await createVesselAction(fd);

    if (res && "error" in res && res.error) {
      setModalError(res.error);
      setModalSubmitting(false);
    } else if (res && "success" in res && res.success && res.data) {
      const newVessel = res.data as { id: string; name: string };
      setLocalVessels((prev) => [...prev, newVessel.name]);
      setSelectedVessel(newVessel.name);
      resetModalStates();
    } else {
      setModalError("Something went wrong while creating vessel.");
      setModalSubmitting(false);
    }
  }

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
            Just the essentials — the card lands in <strong>New Consignments</strong>.
            Arrival, ICD and customs details are captured on the board as work
            begins.
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

          <Field label="Client" required error={errs.client_id}>
            <select
              name="client_id"
              required
              value={selectedClient}
              onChange={(e) => {
                if (e.target.value === "__ADD_NEW__") {
                  setSelectedClient("");
                  setActiveModal("client");
                } else {
                  setSelectedClient(e.target.value);
                }
              }}
              className={inputCls}
            >
              <option value="">Select client…</option>
              {localClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
              <option value="__ADD_NEW__">+ Add new client...</option>
            </select>
          </Field>

          <Field
            label="Goods description"
            hint="Label the cargo, e.g. motorcycle spares"
            error={errs.goods_description}
          >
            <textarea
              name="goods_description"
              rows={2}
              placeholder="e.g. motorcycle spares"
              className={`${inputCls} resize-none`}
            />
          </Field>

          <Field
            label="Consignment nature"
            required
            hint="Transit & Export skip the OGA stages; Import runs the full pipeline."
            error={errs.consignment_nature}
          >
            <select
              name="consignment_nature"
              required
              defaultValue="Import"
              className={inputCls}
            >
              {CONSIGNMENT_NATURES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </section>

        {/* Section: Vessel & logistics */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Vessel &amp; logistics
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="B/L Number" required error={errs.bl_number}>
              <input
                name="bl_number"
                type="text"
                required
                placeholder="e.g. HLBU1234567"
                className={inputCls}
              />
            </Field>

            <Field label="Vessel name" required hint="Pick a known vessel or type a new one" error={errs.vessel_name}>
              <input
                name="vessel_name"
                type="text"
                required
                value={selectedVessel}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "+ Add new vessel...") {
                    setSelectedVessel("");
                    setActiveModal("vessel");
                  } else {
                    setSelectedVessel(val);
                  }
                }}
                list="vessel-options"
                placeholder="e.g. MSC ANNA"
                className={inputCls}
                autoComplete="off"
              />
              <datalist id="vessel-options">
                {localVessels.map((v) => (
                  <option key={v} value={v} />
                ))}
                <option value="+ Add new vessel..." />
              </datalist>
            </Field>

            <Field
              label="Estimated arrival date"
              required
              hint="The exact arrival is confirmed at the Manifest step."
              error={errs.estimated_arrival_date}
            >
              <input
                name="estimated_arrival_date"
                type="date"
                required
                className={inputCls}
              />
            </Field>

            <Field label="Cargo count" required hint="Defaults to 1 if left blank" error={errs.cargo_count}>
              <input
                name="cargo_count"
                type="number"
                min={1}
                required
                placeholder="e.g. 2"
                className={inputCls}
              />
            </Field>

            <Field label="Cargo type" required error={errs.cargo_type}>
              <select name="cargo_type" required defaultValue="" className={inputCls}>
                <option value="" disabled>Select type…</option>
                {CARGO_TYPES.map((t) => (
                  <option key={t} value={t}>{cargoLabel(t)}</option>
                ))}
              </select>
            </Field>

          </div>
        </section>

        {/* Section: Remarks */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Remarks
          </h2>
          <Field label="Internal remarks" error={errs.remarks}>
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

      {/* ── Client Creation Modal ── */}
      {activeModal === "client" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetModalStates} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-foreground">Add New Client</h3>
              <button
                type="button"
                onClick={resetModalStates}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateClient} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Client Name <span className="text-destructive">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Acme Corp"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Display Name</label>
                <input
                  name="display_name"
                  type="text"
                  placeholder="e.g. Acme"
                  value={newClientDisplayName}
                  onChange={(e) => setNewClientDisplayName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Company</label>
                <input
                  name="company"
                  type="text"
                  placeholder="e.g. Acme Industries Ltd"
                  value={newClientCompany}
                  onChange={(e) => setNewClientCompany(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <input
                    name="contact_email"
                    type="text"
                    placeholder="info@acme.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Phone</label>
                  <input
                    name="phone"
                    type="text"
                    placeholder="+255..."
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Additional client details..."
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  className={`${inputCls} resize-none`}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetModalStates}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {modalSubmitting ? "Creating…" : "Save Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Vessel Creation Modal ── */}
      {activeModal === "vessel" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetModalStates} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-foreground">Add New Vessel</h3>
              <button
                type="button"
                onClick={resetModalStates}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateVessel} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Vessel Name <span className="text-destructive">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. MAERSK KENSINGTON"
                  value={newVesselName}
                  onChange={(e) => setNewVesselName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetModalStates}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {modalSubmitting ? "Creating…" : "Save Vessel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
