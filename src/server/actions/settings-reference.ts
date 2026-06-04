"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { z } from "zod";

// Reference-data management (clients, ICDs, vessels). D-050.
//
// Admin-only. Writes go through the user-bound server client — admin RLS on all
// three tables permits the write, so the D-026 admin-client allowlist stays at
// 3 sites. requireAdmin() is defense-in-depth + friendly error messages.

async function requireAdmin() {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) {
    return { error: "Forbidden: admin access required." };
  }
  return null;
}

function trimmedOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// Map a Postgres unique-violation into a human message.
function uniqueError(label: string) {
  return { error: `A ${label} with that name already exists.` };
}

// ── Clients ──────────────────────────────────────────────────────────────────

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sub_label: z.string().trim().max(120).optional().nullable(),
  contact_email: z.union([z.email(), z.literal("")]).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function createClientAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = clientSchema.safeParse({
    name: formData.get("name") ?? "",
    sub_label: trimmedOrNull(formData.get("sub_label")),
    contact_email: trimmedOrNull(formData.get("contact_email")),
    notes: trimmedOrNull(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("clients").insert({
    name: parsed.data.name,
    sub_label: parsed.data.sub_label ?? null,
    contact_email: parsed.data.contact_email || null,
    notes: parsed.data.notes ?? null,
  });
  if (error) return error.code === "23505" ? uniqueError("client") : { error: error.message };

  revalidatePath("/settings/clients");
  return { success: true };
}

export async function updateClientAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid client ID" };

  const parsed = clientSchema.safeParse({
    name: formData.get("name") ?? "",
    sub_label: trimmedOrNull(formData.get("sub_label")),
    contact_email: trimmedOrNull(formData.get("contact_email")),
    notes: trimmedOrNull(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.data.name,
      sub_label: parsed.data.sub_label ?? null,
      contact_email: parsed.data.contact_email || null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", id.data);
  if (error) return error.code === "23505" ? uniqueError("client") : { error: error.message };

  revalidatePath("/settings/clients");
  return { success: true };
}

export async function setClientActiveAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return setActive("clients", "/settings/clients", formData);
}

// ── ICDs ─────────────────────────────────────────────────────────────────────

const icdSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  location: z.string().trim().max(200).optional().nullable(),
});

export async function createIcdAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = icdSchema.safeParse({
    name: formData.get("name") ?? "",
    location: trimmedOrNull(formData.get("location")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("icds")
    .insert({ name: parsed.data.name, location: parsed.data.location ?? null });
  if (error) return error.code === "23505" ? uniqueError("ICD") : { error: error.message };

  revalidatePath("/settings/icds");
  return { success: true };
}

export async function updateIcdAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid ICD ID" };

  const parsed = icdSchema.safeParse({
    name: formData.get("name") ?? "",
    location: trimmedOrNull(formData.get("location")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("icds")
    .update({ name: parsed.data.name, location: parsed.data.location ?? null })
    .eq("id", id.data);
  if (error) return error.code === "23505" ? uniqueError("ICD") : { error: error.message };

  revalidatePath("/settings/icds");
  return { success: true };
}

export async function setIcdActiveAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return setActive("icds", "/settings/icds", formData);
}

// ── Vessels ──────────────────────────────────────────────────────────────────

const vesselSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

export async function createVesselAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = vesselSchema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("vessels").insert({ name: parsed.data.name });
  if (error) return error.code === "23505" ? uniqueError("vessel") : { error: error.message };

  revalidatePath("/settings/vessels");
  return { success: true };
}

export async function updateVesselAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid vessel ID" };

  const parsed = vesselSchema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("vessels")
    .update({ name: parsed.data.name })
    .eq("id", id.data);
  if (error) return error.code === "23505" ? uniqueError("vessel") : { error: error.message };

  revalidatePath("/settings/vessels");
  return { success: true };
}

export async function setVesselActiveAction(formData: FormData) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return setActive("vessels", "/settings/vessels", formData);
}

// ── Shared active-toggle ──────────────────────────────────────────────────────

async function setActive(
  table: "clients" | "icds" | "vessels",
  path: string,
  formData: FormData
) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid ID" };
  const isActive = formData.get("isActive") === "true";

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from(table).update({ is_active: isActive }).eq("id", id.data);
  if (error) return { error: error.message };

  revalidatePath(path);
  return { success: true };
}
