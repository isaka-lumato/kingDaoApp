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

export type CommitFailure = { rowIndex: number; ref_no?: string; error: string };

export type CommitState =
  | { ok: true; jobId: string; inserted: number; failed: number; details: CommitFailure[] }
  | { ok: false; error: string };

// Per-chunk result the client accumulates into a final CommitState.
export type CommitChunkState =
  | { ok: true; inserted: number; failed: number; details: CommitFailure[] }
  | { ok: false; error: string };

function canImport(perms: NonNullable<Awaited<ReturnType<typeof getServerPermissions>>>): boolean {
  return perms.canWrite("consignments", "ref_no");
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
  if (!canImport(perms)) {
    return { ok: false, error: "Your role cannot import." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, error: "File too large (max 8 MB)." };
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
// Commit — chunked, bulk-insert path (D-035).
//
// The old row-by-row commit awaited ~4–6 network round-trips PER ROW, so a
// ~5,000-row historical import took 15–25 min and blew the serverless timeout.
// Instead the client parses once (on preview), then streams the parsed rows
// back in ~300-row chunks. Each chunk resolves FKs in a couple of queries and
// bulk-inserts consignments + EFDs in a handful more — seconds, not minutes —
// while the client renders a live progress bar. Idempotency comes from the
// partial unique index consignments_ref_no_year_uq: re-running the same file
// makes the bulk insert fail, and the row-by-row fallback attributes each
// duplicate individually instead of aborting the whole chunk.
// ──────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServerClient = SupabaseClient<any, "public", any>;

type CommitChunkInput = {
  jobId: string;
  chunk: ParsedConsignment[];
  isFirst: boolean;
  isLast: boolean;
};

export async function commitChunkAction(input: CommitChunkInput): Promise<CommitChunkState> {
  const perms = await getServerPermissions();
  if (!perms) return { ok: false, error: "Not authenticated." };
  if (!canImport(perms)) {
    return { ok: false, error: "Your role cannot import." };
  }
  const canWriteAmount = perms.canWrite("consignments", "amount");

  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing jobId." };

  const chunk = Array.isArray(input.chunk) ? input.chunk : [];

  const supabase = await getSupabaseServerClient();

  let inserted = 0;
  const failures: CommitFailure[] = [];

  try {
    // 1. Resolve (and auto-create) client/ICD FKs for the whole chunk at once.
    const { clientMap, icdMap } = await bulkResolveRefs(supabase, chunk);

    // 2. Pre-resolve each row's FK ids; split out rows that can't be inserted.
    const prepared: Prepared[] = [];
    for (const c of chunk) {
      const clientKey = c.client_name?.trim().toUpperCase() ?? "";
      const client_id = clientKey ? clientMap.get(clientKey) ?? null : null;
      if (!client_id) {
        failures.push({
          rowIndex: c.rowIndex,
          ref_no: c.ref_no,
          error: "client_name is empty — cannot determine client_id.",
        });
        continue;
      }
      if (!c.cargo_type) {
        failures.push({
          rowIndex: c.rowIndex,
          ref_no: c.ref_no,
          error: "cargo_type is required.",
        });
        continue;
      }
      const icdKey = c.icd_name?.trim().toUpperCase() ?? "";
      const icd_id = icdKey ? icdMap.get(icdKey) ?? null : null;
      prepared.push({ c, client_id, icd_id });
    }

    if (prepared.length > 0) {
      // 3. Bulk-insert consignments. A single INSERT is atomic, so on any
      //    error (bad enum, duplicate on re-run) NOTHING was written — we can
      //    safely retry this chunk row-by-row to attribute the failure.
      const { data: consRows, error: consErr } = await supabase
        .from("consignments")
        .insert(prepared.map((p) => buildConsignmentRow(p, canWriteAmount)))
        .select("id, ref_no, year");

      if (consErr || !consRows) {
        const res = await insertRowByRow(supabase, prepared, canWriteAmount);
        inserted += res.inserted;
        failures.push(...res.failures);
      } else {
        inserted += consRows.length;
        // Match returned ids back to prepared rows by the (ref_no, year) key.
        const idByKey = new Map<string, string>();
        for (const r of consRows) idByKey.set(refYearKey(r.ref_no, r.year), r.id);
        const withIds = prepared
          .map((p) => ({ p, id: idByKey.get(refYearKey(p.c.ref_no, p.c.year)) }))
          .filter((x): x is { p: Prepared; id: string } => x.id != null);

        // 4. Bulk-insert EFDs + link rows for the inserted consignments.
        failures.push(...(await insertEfdsBulk(supabase, withIds)));
      }
    }

    // 5. Fold this chunk's results into the audit row; finalise on the last one.
    await updateJobRow(supabase, jobId, inserted, failures, input.isLast);

    if (input.isLast) {
      revalidatePath("/consignments");
      revalidatePath("/");
      revalidatePath("/dashboard");
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  return { ok: true, inserted, failed: failures.length, details: failures };
}

// ──────────────────────────────────────────────────────────────────────────
// Commit helpers
// ──────────────────────────────────────────────────────────────────────────

type Prepared = { c: ParsedConsignment; client_id: string; icd_id: string | null };

function refYearKey(ref_no: string, year: number): string {
  return `${ref_no}__${year}`;
}

// Build the consignments insert object (shared by the bulk and fallback paths).
function buildConsignmentRow(p: Prepared, canWriteAmount: boolean) {
  const { c, client_id, icd_id } = p;
  return {
    ref_no: c.ref_no,
    year: c.year,
    serial_no: c.serial_no,
    tansad_no: c.tansad_no,
    client_id,
    bl_number: c.bl_number,
    cargo_count: c.cargo_count ?? 1,
    cargo_type: c.cargo_type,
    goods_description: c.goods_description,
    vessel_name: c.vessel_name,
    arrival_date: c.arrival_date,
    icd_id,
    amount: canWriteAmount ? c.amount : null,
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
    // D-071: consignment_nature intentionally omitted — the DB column defaults
    // to 'Import' (full pipeline), which is correct for historical rows.
    // estimated_arrival_date / ucr_no also default to null on import.
  };
}

// One SELECT per reference table + one bulk INSERT of the missing names — a
// constant number of round-trips regardless of chunk size. Chunks run
// sequentially (the client awaits each), so a name auto-created by an earlier
// chunk is found by the SELECT here rather than re-inserted.
async function bulkResolveRefs(
  supabase: ServerClient,
  chunk: ParsedConsignment[]
): Promise<{ clientMap: Map<string, string>; icdMap: Map<string, string> }> {
  const clientNames = new Set<string>();
  const icdNames = new Set<string>();
  for (const c of chunk) {
    const ck = c.client_name?.trim().toUpperCase();
    if (ck) clientNames.add(ck);
    const ik = c.icd_name?.trim().toUpperCase();
    if (ik) icdNames.add(ik);
  }

  const clientMap = await resolveNameTable(supabase, "clients", clientNames);
  const icdMap = await resolveNameTable(supabase, "icds", icdNames);
  return { clientMap, icdMap };
}

async function resolveNameTable(
  supabase: ServerClient,
  table: "clients" | "icds",
  wanted: Set<string>
): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // upperName -> id
  if (wanted.size === 0) return map;

  const { data: existing } = await supabase
    .from(table)
    .select("id, name")
    .is("deleted_at", null);
  for (const r of (existing ?? []) as { id: string; name: string }[]) {
    map.set(r.name.trim().toUpperCase(), r.id);
  }

  const missing = Array.from(wanted).filter((n) => !map.has(n));
  if (missing.length > 0) {
    const { data: created, error } = await supabase
      .from(table)
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (error || !created) {
      throw new Error(`Could not auto-create ${table}: ${error?.message ?? "unknown"}`);
    }
    for (const r of created as { id: string; name: string }[]) {
      map.set(r.name.trim().toUpperCase(), r.id);
    }
  }
  return map;
}

// Bulk-insert every EFD record for the chunk in one statement, then every link
// row in one more. A single INSERT ... RETURNING preserves VALUES order, so we
// zip the returned ids back by position. On a wholesale EFD failure we fall
// back to per-code inserts — the consignments are already committed, so we must
// not re-insert them.
async function insertEfdsBulk(
  supabase: ServerClient,
  rows: { p: Prepared; id: string }[]
): Promise<CommitFailure[]> {
  const failures: CommitFailure[] = [];

  type EfdSeed = { consignmentId: string; c: ParsedConsignment; code: string };
  const seeds: EfdSeed[] = [];
  for (const { p, id } of rows) {
    for (const code of p.c.efd_codes) {
      seeds.push({ consignmentId: id, c: p.c, code });
    }
  }
  if (seeds.length === 0) return failures;

  const efdInsert = seeds.map((s) => {
    const flags = normaliseFlagsFromCode(s.code, {});
    return {
      efd_code: s.code,
      efd_time: s.c.efd_time,
      is_private: flags.is_private,
      is_transit: flags.is_transit,
      is_shared: false,
    };
  });

  const { data: efdRows, error: efdErr } = await supabase
    .from("efd_records")
    .insert(efdInsert)
    .select("id");

  if (efdErr || !efdRows || efdRows.length !== seeds.length) {
    // Fall back to per-code inserts so one bad code doesn't lose the rest.
    for (const s of seeds) {
      failures.push(...(await insertOneEfd(supabase, s.consignmentId, s.c, s.code)));
    }
    return failures;
  }

  const links = seeds.map((s, i) => ({
    efd_record_id: (efdRows[i] as { id: string }).id,
    consignment_id: s.consignmentId,
  }));
  const { error: linkErr } = await supabase.from("efd_record_consignments").insert(links);
  if (linkErr) {
    // Links are the cheap part; surface once with the affected rows.
    for (const s of seeds) {
      failures.push({
        rowIndex: s.c.rowIndex,
        ref_no: s.c.ref_no,
        error: `efd link bulk insert failed: ${linkErr.message}`,
      });
    }
  }
  return failures;
}

// Insert a single EFD record + its link (used by the EFD fallback path).
async function insertOneEfd(
  supabase: ServerClient,
  consignmentId: string,
  c: ParsedConsignment,
  code: string
): Promise<CommitFailure[]> {
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
    return [{
      rowIndex: c.rowIndex,
      ref_no: c.ref_no,
      error: `efd_records insert failed for code "${code}": ${efdErr?.message ?? "unknown"}`,
    }];
  }
  const { error: linkErr } = await supabase
    .from("efd_record_consignments")
    .insert({ efd_record_id: efdRow.id, consignment_id: consignmentId });
  if (linkErr) {
    return [{
      rowIndex: c.rowIndex,
      ref_no: c.ref_no,
      error: `efd link failed for code "${code}": ${linkErr.message}`,
    }];
  }
  return [];
}

// Fallback: insert each prepared consignment (and its EFDs) individually so a
// single bad/duplicate row is attributed instead of failing the whole chunk.
async function insertRowByRow(
  supabase: ServerClient,
  prepared: Prepared[],
  canWriteAmount: boolean,
): Promise<{ inserted: number; failures: CommitFailure[] }> {
  const failures: CommitFailure[] = [];
  let inserted = 0;
  for (const p of prepared) {
    const { c } = p;
    try {
      const { data: consInserted, error: consErr } = await supabase
        .from("consignments")
        .insert(buildConsignmentRow(p, canWriteAmount))
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
      for (const code of c.efd_codes) {
        failures.push(...(await insertOneEfd(supabase, consInserted.id, c, code)));
      }
      inserted++;
    } catch (e) {
      failures.push({ rowIndex: c.rowIndex, ref_no: c.ref_no, error: (e as Error).message });
    }
  }
  return { inserted, failures };
}

// Fold a chunk's counts into the import_jobs audit row. Read-then-write is safe
// because chunks commit sequentially; on the last chunk we stamp the terminal
// status and committed_at.
async function updateJobRow(
  supabase: ServerClient,
  jobId: string,
  chunkInserted: number,
  chunkFailures: CommitFailure[],
  isLast: boolean
): Promise<void> {
  const { data: job } = await supabase
    .from("import_jobs")
    .select("inserted_count, payload")
    .eq("id", jobId)
    .single();

  const priorInserted = (job?.inserted_count as number | null) ?? 0;
  const priorPayload = (job?.payload as Record<string, unknown> | null) ?? {};
  const priorFailures = Array.isArray(priorPayload.failures)
    ? (priorPayload.failures as CommitFailure[])
    : [];

  const newInserted = priorInserted + chunkInserted;
  const mergedFailures = [...priorFailures, ...chunkFailures];

  await supabase
    .from("import_jobs")
    .update({
      inserted_count: newInserted,
      status: isLast ? (newInserted > 0 ? "committed" : "failed") : "previewed",
      committed_at: isLast ? new Date().toISOString() : null,
      payload: { ...priorPayload, failures: mergedFailures },
    })
    .eq("id", jobId);
}
