import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createVesselAction,
  updateVesselAction,
  setVesselActiveAction,
} from "@/server/actions/settings-reference";
import ReferenceManager, { type RefRow } from "../reference-manager";

export const metadata: Metadata = { title: "Vessels — Settings" };

export default async function VesselsSettingsPage() {
  // Admin gate enforced by settings/layout.tsx. User-bound client; RLS lets any
  // authenticated user read vessels.
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name, is_active")
    .is("deleted_at", null)
    .order("name");

  return (
    <ReferenceManager
      title="Vessels"
      singular="vessel"
      fields={[{ name: "name", label: "Name", required: true, placeholder: "e.g. MSC ANNA" }]}
      rows={(data ?? []) as RefRow[]}
      fetchError={error?.message}
      createAction={createVesselAction}
      updateAction={updateVesselAction}
      setActiveAction={setVesselActiveAction}
    />
  );
}
