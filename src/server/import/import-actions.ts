"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { normaliseFlagsFromCode } from "@/schemas/efd";
import {
  parseTracker,
  type CellValue,
  type ParseResult,
  type ParsedConsignment,
} from "./parse-tracker";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type PreviewState = {
  ok: true;
  jobId: string;
  filename: string;
  result: ParseResult;
  autoCreate: {
    clients: string[];
    icds: string[];
  };
} | {
  ok: false;
  error: string;
};

export type CommitState =
  | { ok: true; jobId: string; inserted: number; failed: number; details: { rowIndex: number; ref_no?: string; error: string }[] }
  | { ok: false; error: string };

function canImport(roles: string[], isAdmin: boolean): boolean {
  return isAdmin || roles.includes("operator");
}

// SheetJS adapter — workbook bytes → CellValue[][] for the first sheet.
function workbookToRows(buf: ArrayBuffer): CellValue[][] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName]!;
  // `header: 1` → array-of-arrays, `raw: true` → preserve numeric cell values
  // (so Excel serials reach the parser as numbers), `defval: null` → empty
  // cells materialise as null so column indexing stays stable.
  const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
// Preview — parse + insert an `import_jobs` row in status='previewed'
// ──────────────────────────────────────────────────────────────────────────

export async function previewImportAction(formData: FormData): Promise<PreviewState> {
  const perms = await getServerPermissions();
  if (!perms) return { ok: false, error: "Not authenticated." };
  if (!canImport(perms.roles, perms.isAdmin)) {
    return { ok: false, error: "Your role cannot import." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "File too large (max 25 MB)." };
  }

  let rows: CellValue[][];
  try {
    const buf = await file.arrayBuffer();
    rows = workbookToRows(buf);
  } catch (e) {
    return { ok: false, error: `Could not read workbook: ${(e as Error).message}` };
  }

  const result = parseTracker(rows);

  // Compute the auto-create previews so the UI can show them before commit.
  const supabase = await getSupabaseServerClient();
  const autoCreate = await computeAutoCreateLists(supabase, result.consignments);

  // Insert the previewed audit row.
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      user_id: perms.userId,
      filename: file.name,
      status: "previewed",
      parsed_count: result.summary.parsed,
      errors_count: result.summary.errors,
      warnings_count: result.summary.warnings,
      payload: {
        summary: result.summary,
        errors: result.errors,
        warnings: result.warnings,
        autoCreate,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not record import job." };
  }

  return {
    ok: true,
    jobId: data.id,
    filename: file.name,
    result,
    autoCreate,
  };
}

// Lookup-without-create: returns the names we'd need to auto-create on confirm.
async function computeAutoCreateLists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  consignments: ParsedConsignment[]
): Promise<{ clients: string[]; icds: string[] }> {
  const clientNames = new Set<string>();
  const icdNames = new Set<string>();
  for (const c of consignments) {
    if (c.client_name) clientNames.add(c.client_name.trim());
    if (c.icd_name) icdNames.add(c.icd_name.trim());
  }
  if (clientNames.size === 0 && icdNames.size === 0) {
    return { clients: [], icds: [] };
  }

  const { data: clientsData } = await supabase
    .from("clients")
    .select("name")
    .is("deleted_at", null);
  const existingClients = new Set(
    (clientsData ?? []).map((r: { name: string }) => r.name.trim().toUpperCase())
  );
  const missingClients = Array.from(clientNames).filter(
    (n) => !existingClients.has(n.toUpperCase())
  );

  const { data: icdsData } = await supabase
    .from("icds")
    .select("name")
    .is("deleted_at", null);
  const existingIcds = new Set(
    (icdsData ?? []).map((r: { name: string }) => r.name.trim().toUpperCase())
  );
  const missingIcds = Array.from(icdNames).filter(
    (n) => !existingIcds.has(n.toUpperCase())
  );

  return { clients: missingClients.sort(), icds: missingIcds.sort() };
}

// ──────────────────────────────────────────────────────────────────────────
// Commit — re-parse from the uploaded file, then insert row-by-row
// ──────────────────────────────────────────────────────────────────────────

export async function commitImportAction(formData: FormData): Promise<CommitState> {
  const perms = await getServerPermissions();
  if (!perms) return { ok: false, error: "Not authenticated." };
  if (!canImport(perms.roles, perms.isAdmin)) {
    return { ok: false, error: "Your role cannot import." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing jobId." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Missing file for commit." };
  }

  let rows: CellValue[][];
  try {
    const buf = await file.arrayBuffer();
    rows = workbookToRows(buf);
  } catch (e) {
    return { ok: false, error: `Could not read workbook: ${(e as Error).message}` };
  }

  const supabase = await getSupabaseServerClient();
  const parsed = parseTracker(rows);

  // Resolve / auto-create FKs. Caches keyed by uppercased name so subsequent
  // rows reuse the lookup.
  const clientCache = new Map<string, string>(); // upperName -> id
  const icdCache = new Map<string, string>();

  async function resolveClientId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.trim().toUpperCase();
    if (!key) return null;
    if (clientCache.has(key)) return clientCache.get(key)!;
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      clientCache.set(key, existing.id);
      return existing.id;
    }
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ name: key })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Could not auto-create client "${name}": ${error?.message ?? "unknown"}`);
    clientCache.set(key, created.id);
    return created.id;
  }

  async function resolveIcdId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.trim().toUpperCase();
    if (!key) return null;
    if (icdCache.has(key)) return icdCache.get(key)!;
    const { data: existing } = await supabase
      .from("icds")
      .select("id")
      .ilike("name", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      icdCache.set(key, existing.id);
      return existing.id;
    }
    const { data: created, error } = await supabase
      .from("icds")
      .insert({ name: key })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Could not auto-create ICD "${name}": ${error?.message ?? "unknown"}`);
    icdCache.set(key, created.id);
    return created.id;
  }

  const failures: { rowIndex: number; ref_no?: string; error: string }[] = [];
  let inserted = 0;

  for (const c of parsed.consignments) {
    try {
      const client_id = await resolveClientId(c.client_name);
      if (!client_id) {
        failures.push({
          rowIndex: c.rowIndex,
          ref_no: c.ref_no,
          error: "client_name is empty — cannot determine client_id.",
        });
        continue;
      }
      const icd_id = c.icd_name ? await resolveIcdId(c.icd_name) : null;

      if (!c.container_type) {
        failures.push({
          rowIndex: c.rowIndex,
          ref_no: c.ref_no,
          error: "container_type is required.",
        });
        continue;
      }

      // Insert consignment.
      const { data: consInserted, error: consErr } = await supabase
        .from("consignments")
        .insert({
          ref_no: c.ref_no,
          year: c.year,
          serial_no: c.serial_no,
          tansad_no: c.tansad_no,
          client_id,
          bl_number: c.bl_number,
          container_count: c.container_count ?? 1,
          container_type: c.container_type,
          goods_description: c.goods_description,
          vessel_name: c.vessel_name,
          arrival_date: c.arrival_date,
          icd_id,
          in_ref: c.in_ref,
          amount: c.amount,
          remarks: c.remarks,
          manifest_status: c.manifest_status,
          shipping_batch_status: c.shipping_batch_status,
          current_status: c.current_status,
          tanesws_status: c.tanesws_status,
          assessment_status: c.assessment_status,
          tbs_loading_status: c.tbs_loading_status,
          tbs_debit_status: c.tbs_debit_status,
          manifest_comp_status: c.manifest_comp_status,
          duty_status: c.duty_status,
          inspection_file_status: c.inspection_file_status,
          release_status: c.release_status,
          release_date: c.release_date,
        })
        .select("id")
        .single();

      if (consErr || !consInserted) {
        failures.push({
          rowIndex: c.rowIndex,
          ref_no: c.ref_no,
          error: `consignment insert failed: ${consErr?.message ?? "unknown"}`,
        });
        continue;
      }

      const consignmentId = consInserted.id;

      // EFDs — each code becomes an efd_record + link row. is_shared defaults
      // to false for fresh imports; later edits via the EFD UI will recompute
      // it the moment a second consignment links to the same code.
      for (const code of c.efd_codes) {
        const flags = normaliseFlagsFromCode(code, {});
        const { data: efdRow, error: efdErr } = await supabase
          .from("efd_records")
          .insert({
            efd_code: code,
            efd_time: c.efd_time,
            is_private: flags.is_private,
            is_transit: flags.is_transit,
            is_shared: false,
          })
          .select("id")
          .single();

        if (efdErr || !efdRow) {
          failures.push({
            rowIndex: c.rowIndex,
            ref_no: c.ref_no,
            error: `efd_records insert failed for code "${code}": ${efdErr?.message ?? "unknown"}`,
          });
          continue;
        }

        const { error: linkErr } = await supabase
          .from("efd_record_consignments")
          .insert({
            efd_record_id: efdRow.id,
            consignment_id: consignmentId,
          });

        if (linkErr) {
          failures.push({
            rowIndex: c.rowIndex,
            ref_no: c.ref_no,
            error: `efd link failed for code "${code}": ${linkErr.message}`,
          });
        }
      }

      inserted++;
    } catch (e) {
      failures.push({
        rowIndex: c.rowIndex,
        ref_no: c.ref_no,
        error: (e as Error).message,
      });
    }
  }

  // Update the audit row.
  const status = failures.length === 0 ? "committed" : inserted > 0 ? "committed" : "failed";
  await supabase
    .from("import_jobs")
    .update({
      status,
      inserted_count: inserted,
      committed_at: new Date().toISOString(),
      payload: {
        summary: parsed.summary,
        errors: parsed.errors,
        warnings: parsed.warnings,
        failures,
      },
    })
    .eq("id", jobId);

  revalidatePath("/consignments");
  revalidatePath("/");
  revalidatePath("/dashboard");

  return {
    ok: true,
    jobId,
    inserted,
    failed: failures.length,
    details: failures,
  };
}
