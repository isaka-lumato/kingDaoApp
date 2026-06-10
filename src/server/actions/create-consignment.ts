"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { friendlyConsignmentDbError } from "@/lib/db-errors";
import { z } from "zod";

const newConsignmentSchema = z.object({
  client_id: z.uuid("Please select a client."),
  year: z.coerce
    .number({ error: "Please select a year." })
    .int("Year must be a whole number.")
    .min(2000, "Year must be 2000 or later.")
    .max(2100, "Year must be 2100 or earlier."),
  bl_number: z
    .string()
    .max(100, "B/L number is too long (max 100 characters).")
    .optional()
    .or(z.literal("")),
  tansad_no: z
    .string()
    .max(100, "TANSAD number is too long (max 100 characters).")
    .optional()
    .or(z.literal("")),
  vessel_name: z
    .string({ error: "Please enter the vessel name." })
    .trim()
    .min(1, "Please enter the vessel name.")
    .max(200, "Vessel name is too long (max 200 characters)."),
  arrival_date: z.string().optional().or(z.literal("")),
  container_count: z.coerce
    .number({ error: "Container count must be a number." })
    .int("Container count must be a whole number.")
    .min(1, "Container count must be at least 1.")
    .optional()
    .or(z.literal("")),
  container_type: z.enum(["40FT", "20FT", "CAR", "COIL"], {
    error: "Please select a container type.",
  }),
  goods_description: z
    .string()
    .max(1000, "Goods description is too long (max 1000 characters).")
    .optional()
    .or(z.literal("")),
  icd_id: z.uuid("Please choose a valid ICD.").optional().or(z.literal("")),
  amount: z.coerce
    .number({ error: "Amount must be a number." })
    .int("Amount must be a whole number.")
    .min(0, "Amount cannot be negative.")
    .optional()
    .or(z.literal("")),
  remarks: z
    .string()
    .max(2000, "Remarks are too long (max 2000 characters).")
    .optional()
    .or(z.literal("")),
});

type FieldErrors = Partial<Record<keyof typeof newConsignmentSchema.shape, string>>;

export type CreateConsignmentState = {
  error?: string;
  fieldErrors?: FieldErrors;
} | null;

export async function createConsignmentAction(
  _prevState: CreateConsignmentState,
  formData: FormData
): Promise<CreateConsignmentState | never> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!perms.canWrite("consignments", "ref_no")) {
    return { error: "You do not have permission to create consignments." };
  }

  const raw = Object.fromEntries(
    Array.from(formData.entries()).map(([k, v]) => [k, v === "" ? undefined : v])
  );

  const parsed = newConsignmentSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof FieldErrors | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      error: "Please fix the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const d = parsed.data;
  const supabase = await getSupabaseServerClient();

  // B/L must be unique per year (PRD §8.2). Pre-check so the user gets a clear,
  // field-level message; the DB unique index remains the backstop for races.
  const blValue = d.bl_number?.trim();
  if (blValue) {
    const { data: dupe } = await supabase
      .from("consignments")
      .select("ref_no")
      .eq("year", d.year)
      .eq("bl_number", blValue)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (dupe) {
      return {
        error: "Please fix the highlighted fields and try again.",
        fieldErrors: {
          bl_number: `A consignment with this B/L number already exists for ${d.year} (${dupe.ref_no}).`,
        },
      };
    }
  }

  // Auto-generate serial_no (next for this year) and ref_no.
  const { data: lastSerial } = await supabase
    .from("consignments")
    .select("serial_no")
    .eq("year", d.year)
    .order("serial_no", { ascending: false })
    .limit(1)
    .single();

  const nextSerial = (lastSerial?.serial_no ?? 0) + 1;
  // ref_no format: YYXXXXX e.g. 260001 for year 2026, serial 1
  const yearSuffix = String(d.year).slice(2);
  const ref_no = `${yearSuffix}${String(nextSerial).padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("consignments")
    .insert({
      ref_no,
      serial_no: nextSerial,
      client_id: d.client_id,
      year: d.year,
      bl_number: d.bl_number || null,
      tansad_no: d.tansad_no || null,
      vessel_name: d.vessel_name || null,
      arrival_date: d.arrival_date || null,
      // container_count is NOT NULL in the DB (defaults to 1); fall back to 1 when blank.
      container_count: d.container_count ? Number(d.container_count) : 1,
      container_type: d.container_type,
      goods_description: d.goods_description || null,
      icd_id: d.icd_id || null,
      amount: d.amount ? Number(d.amount) : null,
      remarks: d.remarks || null,
      // All stages start at Waiting
      manifest_status: "Waiting",
      shipping_batch_status: "Waiting",
      tanesws_status: "Waiting",
      assessment_status: "Waiting",
      tbs_loading_status: "Waiting",
      tbs_debit_status: "Waiting",
      manifest_comp_status: "Waiting",
      duty_status: "Waiting",
      inspection_file_status: "Waiting",
      release_status: "Waiting",
    })
    .select("id")
    .single();

  if (error) return { error: friendlyConsignmentDbError(error) };

  redirect(`/consignments/${data.id}`);
}
