import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createClientAction,
  updateClientAction,
  setClientActiveAction,
} from "@/server/actions/settings-reference";
import ReferenceManager, { type RefRow } from "../reference-manager";

export const metadata: Metadata = { title: "Clients — Settings" };

export default async function ClientsSettingsPage() {
  // Admin gate is enforced by settings/layout.tsx. User-bound client; RLS
  // lets any authenticated user read clients.
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, sub_label, contact_email, notes, is_active")
    .is("deleted_at", null)
    .order("name")
    .order("sub_label", { nullsFirst: true });

  return (
    <ReferenceManager
      title="Clients"
      singular="client"
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. PAPA" },
        { name: "sub_label", label: "Variant", placeholder: "e.g. SAAJT (optional)" },
        { name: "contact_email", label: "Contact email", type: "email", placeholder: "optional" },
        { name: "notes", label: "Notes", placeholder: "optional" },
      ]}
      rows={(data ?? []) as RefRow[]}
      fetchError={error?.message}
      createAction={createClientAction}
      updateAction={updateClientAction}
      setActiveAction={setClientActiveAction}
    />
  );
}
