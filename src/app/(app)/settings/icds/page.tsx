import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createIcdAction,
  updateIcdAction,
  setIcdActiveAction,
} from "@/server/actions/settings-reference";
import ReferenceManager, { type RefRow } from "../reference-manager";

export const metadata: Metadata = { title: "ICDs — Settings" };

export default async function IcdsSettingsPage() {
  // Admin gate enforced by settings/layout.tsx. User-bound client; RLS lets any
  // authenticated user read ICDs.
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("icds")
    .select("id, name, location, is_active")
    .is("deleted_at", null)
    .order("name");

  return (
    <ReferenceManager
      title="ICDs"
      singular="ICD"
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. DP WORLD" },
        { name: "location", label: "Location", placeholder: "optional" },
      ]}
      rows={(data ?? []) as RefRow[]}
      fetchError={error?.message}
      createAction={createIcdAction}
      updateAction={updateIcdAction}
      setActiveAction={setIcdActiveAction}
    />
  );
}
