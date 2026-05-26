/**
 * T-062 — CLI tracker importer.
 *
 * Usage:
 *   pnpm import:tracker <file.xlsx> [--commit] [--no-auto-create] [--yes] [--env-file <path>]
 *
 * Default mode is DRY-RUN: parses, prints a summary, dumps the full parser
 * output to `tmp/import-preview-<ts>.json`, and does NOT touch the database.
 * Pass `--commit` to actually insert. The script will require typing `IMPORT`
 * on stdin to proceed (skip with `--yes` when running non-interactively).
 *
 * Auth model: admin (service-key) client built from `.env.local`, the same
 * pattern used by `scripts/create-viewer-user.mjs`. Bypasses RLS — designed
 * for the initial bulk historical load, not for routine use. The UI (`/import`)
 * is the right tool for per-shipment imports.
 *
 * See D-038 for the design rationale.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";

import {
  parseTracker,
  type CellValue,
  type ParsedConsignment,
  type ParseResult,
} from "@/server/import/parse-tracker";
import { normaliseFlagsFromCode } from "@/schemas/efd";

// ──────────────────────────────────────────────────────────────────────────
// Constants — keep these in sync with package.json gen:types:dev/prod IDs.
// ──────────────────────────────────────────────────────────────────────────

const DEV_PROJECT_ID = "vmkhiahoytuqnjpcxwrb";
const PROD_PROJECT_ID = "wmipzsldwnyyweerpcmd";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — CLI allowance is higher than UI's 25 MB

// ──────────────────────────────────────────────────────────────────────────
// Arg parsing — manual, no commander dep.
// ──────────────────────────────────────────────────────────────────────────

type Args = {
  file: string;
  commit: boolean;
  noAutoCreate: boolean;
  yes: boolean;
  envFile: string;
};

function printUsageAndExit(code: number): never {
  process.stderr.write(
    [
      "Usage: pnpm import:tracker <file.xlsx> [options]",
      "",
      "Options:",
      "  --commit            Actually write to the database (default: dry-run)",
      "  --no-auto-create    Fail if any client/ICD would need to be created",
      "  --yes               Skip the interactive 'type IMPORT to confirm' prompt",
      "  --env-file <path>   Override .env.local path (default: ./.env.local)",
      "  -h, --help          Print this help",
      "",
      "Examples:",
      "  pnpm import:tracker fixtures/TRACKER_--_KDL.xlsx",
      "  pnpm import:tracker fixtures/TRACKER_--_KDL.xlsx --commit",
      "",
    ].join("\n"),
  );
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    file: "",
    commit: false,
    noAutoCreate: false,
    yes: false,
    envFile: resolve(process.cwd(), ".env.local"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") printUsageAndExit(0);
    else if (a === "--commit") out.commit = true;
    else if (a === "--no-auto-create") out.noAutoCreate = true;
    else if (a === "--yes") out.yes = true;
    else if (a === "--env-file") {
      const next = argv[i + 1];
      if (!next) {
        process.stderr.write("--env-file requires a path.\n");
        printUsageAndExit(1);
      }
      out.envFile = resolve(process.cwd(), next);
      i++;
    } else if (a.startsWith("--") || a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      printUsageAndExit(1);
    } else if (!out.file) {
      out.file = resolve(process.cwd(), a);
    } else {
      process.stderr.write(`Unexpected positional argument: ${a}\n`);
      printUsageAndExit(1);
    }
  }
  if (!out.file) {
    process.stderr.write("Missing required <file.xlsx> argument.\n");
    printUsageAndExit(1);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// .env.local loader — same as scripts/create-viewer-user.mjs
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    process.stderr.write(`Could not read env file at ${path}: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// ──────────────────────────────────────────────────────────────────────────
// SheetJS adapter — mirrors workbookToRows() in import-actions.ts:43-57.
// ──────────────────────────────────────────────────────────────────────────

function workbookToRows(buf: Buffer): CellValue[][] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName]!;
  const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
// Banner helpers
// ──────────────────────────────────────────────────────────────────────────

function projectLabel(url: string): "DEV" | "PROD" | "UNKNOWN" {
  if (url.includes(DEV_PROJECT_ID)) return "DEV";
  if (url.includes(PROD_PROJECT_ID)) return "PROD";
  return "UNKNOWN";
}

function colour(s: string, code: string): string {
  // Skip ANSI when not a TTY (e.g. piped into a log file).
  if (!process.stdout.isTTY) return s;
  return `[${code}m${s}[0m`;
}

// ──────────────────────────────────────────────────────────────────────────
// Confirmation
// ──────────────────────────────────────────────────────────────────────────

function confirmTypingImport(): Promise<boolean> {
  return new Promise((resolveP) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Type "IMPORT" (uppercase) to proceed, anything else to abort: ', (answer) => {
      rl.close();
      resolveP(answer.trim() === "IMPORT");
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// FK resolution — mirrors resolveClientId/resolveIcdId in import-actions.ts.
// ──────────────────────────────────────────────────────────────────────────

type Sb = SupabaseClient;

function makeResolver(
  supabase: Sb,
  table: "clients" | "icds",
  cache: Map<string, string>,
  allowCreate: boolean,
) {
  return async function resolve(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.trim().toUpperCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const { data: existing } = await supabase
      .from(table)
      .select("id")
      .ilike("name", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      cache.set(key, existing.id);
      return existing.id;
    }
    if (!allowCreate) {
      throw new Error(
        `${table === "clients" ? "Client" : "ICD"} "${name}" not found and --no-auto-create is set.`,
      );
    }
    const { data: created, error } = await supabase
      .from(table)
      .insert({ name: key })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(
        `Could not auto-create ${table === "clients" ? "client" : "ICD"} "${name}": ${
          error?.message ?? "unknown"
        }`,
      );
    }
    cache.set(key, created.id);
    return created.id;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Auto-create preview — mirrors computeAutoCreateLists in import-actions.ts.
// ──────────────────────────────────────────────────────────────────────────

async function computeAutoCreateLists(
  supabase: Sb,
  consignments: ParsedConsignment[],
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
    (clientsData ?? []).map((r: { name: string }) => r.name.trim().toUpperCase()),
  );
  const missingClients = Array.from(clientNames).filter(
    (n) => !existingClients.has(n.toUpperCase()),
  );

  const { data: icdsData } = await supabase
    .from("icds")
    .select("name")
    .is("deleted_at", null);
  const existingIcds = new Set(
    (icdsData ?? []).map((r: { name: string }) => r.name.trim().toUpperCase()),
  );
  const missingIcds = Array.from(icdNames).filter(
    (n) => !existingIcds.has(n.toUpperCase()),
  );

  return { clients: missingClients.sort(), icds: missingIcds.sort() };
}

// ──────────────────────────────────────────────────────────────────────────
// Commit loop — mirrors commitImportAction:254-372.
// ──────────────────────────────────────────────────────────────────────────

type Failure = { rowIndex: number; ref_no?: string; error: string };

async function commitRows(
  supabase: Sb,
  parsed: ParseResult,
  allowAutoCreate: boolean,
): Promise<{ inserted: number; failures: Failure[] }> {
  const clientCache = new Map<string, string>();
  const icdCache = new Map<string, string>();
  const resolveClientId = makeResolver(supabase, "clients", clientCache, allowAutoCreate);
  const resolveIcdId = makeResolver(supabase, "icds", icdCache, allowAutoCreate);

  const failures: Failure[] = [];
  let inserted = 0;
  const total = parsed.consignments.length;

  for (let i = 0; i < total; i++) {
    const c = parsed.consignments[i]!;
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

    if ((i + 1) % 25 === 0 || i + 1 === total) {
      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r  progress: ${i + 1}/${total} (inserted=${inserted} failed=${failures.length})`,
        );
      }
    }
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
  return { inserted, failures };
}

// ──────────────────────────────────────────────────────────────────────────
// Pretty-printers
// ──────────────────────────────────────────────────────────────────────────

function printSummary(parsed: ParseResult): void {
  const { summary } = parsed;
  process.stdout.write(
    [
      "",
      "Parser summary:",
      `  total rows scanned: ${summary.totalRows}`,
      `  parsed:             ${summary.parsed}`,
      `  skipped (blank):    ${summary.skipped}`,
      `  errors:             ${summary.errors}`,
      `  warnings:           ${summary.warnings}`,
      `  years detected:     ${summary.years.length ? summary.years.join(", ") : "(none — file may lack year separators)"}`,
      "",
    ].join("\n"),
  );

  if (parsed.errors.length > 0) {
    process.stdout.write("First 5 errors:\n");
    for (const e of parsed.errors.slice(0, 5)) {
      process.stdout.write(
        `  row ${e.rowIndex} ${e.ref_no ? `(${e.ref_no}) ` : ""}${e.field ? `[${e.field}] ` : ""}— ${e.message}\n`,
      );
    }
    if (parsed.errors.length > 5) {
      process.stdout.write(`  …and ${parsed.errors.length - 5} more\n`);
    }
    process.stdout.write("\n");
  }
  if (parsed.warnings.length > 0) {
    process.stdout.write("First 5 warnings:\n");
    for (const w of parsed.warnings.slice(0, 5)) {
      process.stdout.write(
        `  row ${w.rowIndex} ${w.ref_no ? `(${w.ref_no}) ` : ""}${w.field ? `[${w.field}] ` : ""}— ${w.message}\n`,
      );
    }
    if (parsed.warnings.length > 5) {
      process.stdout.write(`  …and ${parsed.warnings.length - 5} more\n`);
    }
    process.stdout.write("\n");
  }
}

function printAutoCreate(autoCreate: { clients: string[]; icds: string[] }): void {
  process.stdout.write(
    `Reference-data diff:\n` +
      `  missing clients: ${autoCreate.clients.length}${
        autoCreate.clients.length ? " — " + autoCreate.clients.join(", ") : ""
      }\n` +
      `  missing ICDs:    ${autoCreate.icds.length}${
        autoCreate.icds.length ? " — " + autoCreate.icds.join(", ") : ""
      }\n\n`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// main()
// ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnvLocal(args.envFile);
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    process.stderr.write(
      `Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in ${args.envFile}.\n`,
    );
    process.exit(1);
  }

  // File checks.
  let buf: Buffer;
  try {
    buf = readFileSync(args.file);
  } catch (e) {
    process.stderr.write(`Could not read input file: ${(e as Error).message}\n`);
    process.exit(1);
  }
  if (buf.byteLength === 0) {
    process.stderr.write("Input file is empty.\n");
    process.exit(1);
  }
  if (buf.byteLength > MAX_FILE_BYTES) {
    process.stderr.write(
      `Input file is ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB — exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB cap.\n`,
    );
    process.exit(1);
  }

  // Banner.
  const label = projectLabel(SUPABASE_URL);
  const modeLabel = args.commit ? colour("COMMIT", "1;31") : colour("DRY-RUN", "1;33");
  const labelColoured =
    label === "PROD" ? colour(label, "1;31") : label === "DEV" ? colour(label, "1;32") : colour(label, "1;33");
  process.stdout.write(
    [
      "",
      `KDL Tracker importer — mode: ${modeLabel}`,
      `  file:      ${args.file}`,
      `  size:      ${(buf.byteLength / 1024).toFixed(1)} KB`,
      `  project:   ${labelColoured} (${SUPABASE_URL})`,
      `  auto-create: ${args.noAutoCreate ? "disabled" : "enabled"}`,
      "",
    ].join("\n"),
  );

  if (label === "UNKNOWN") {
    process.stderr.write(
      `Warning: target project URL does not match known DEV (${DEV_PROJECT_ID}) or PROD (${PROD_PROJECT_ID}) IDs.\n`,
    );
  }

  // Read workbook.
  let rows: CellValue[][];
  try {
    rows = workbookToRows(buf);
  } catch (e) {
    process.stderr.write(`Could not read workbook: ${(e as Error).message}\n`);
    process.exit(1);
  }

  // Parse.
  const parsed = parseTracker(rows);
  printSummary(parsed);

  // Auto-create preview — uses a temporary supabase client so we can print
  // the diff even in dry-run mode.
  const supabase: Sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const autoCreate = await computeAutoCreateLists(supabase, parsed.consignments);
  printAutoCreate(autoCreate);

  // Dry-run branch — dump preview JSON, exit.
  if (!args.commit) {
    const tmpDir = resolve(process.cwd(), "tmp");
    try {
      mkdirSync(tmpDir, { recursive: true });
    } catch {
      // mkdirSync({recursive:true}) only throws on permission errors etc; report and bail.
      process.stderr.write(`Could not create ${tmpDir}.\n`);
    }
    const out = resolve(
      tmpDir,
      `import-preview-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(
      out,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          file: args.file,
          project: { label, url: SUPABASE_URL },
          summary: parsed.summary,
          autoCreate,
          errors: parsed.errors,
          warnings: parsed.warnings,
        },
        null,
        2,
      ),
    );
    process.stdout.write(`Dry-run complete. Full preview written to:\n  ${out}\n`);
    process.stdout.write("\nRe-run with --commit to actually insert.\n");
    process.exit(0);
  }

  // Commit branch — sanity checks + confirmation.
  if (parsed.summary.parsed === 0) {
    process.stderr.write("Nothing to commit (parsed = 0).\n");
    process.exit(1);
  }
  if (args.noAutoCreate && (autoCreate.clients.length > 0 || autoCreate.icds.length > 0)) {
    process.stderr.write(
      "Aborting: --no-auto-create is set and reference data is missing (see lists above).\n",
    );
    process.exit(1);
  }
  if (parsed.summary.errors > 0) {
    process.stdout.write(
      `Note: ${parsed.summary.errors} rows will be skipped due to parser errors (see list above).\n`,
    );
  }

  if (!args.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "stdin is not a TTY and --yes was not passed. Aborting to avoid an unattended commit.\n",
      );
      process.exit(1);
    }
    const confirmed = await confirmTypingImport();
    if (!confirmed) {
      process.stderr.write("Aborted by user.\n");
      process.exit(1);
    }
  }

  // Create the import_jobs row up front (admin client bypasses RLS; user_id = null
  // because there's no logged-in operator on the CLI).
  const { data: jobRow, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      user_id: null,
      filename: basename(args.file),
      status: "previewed",
      parsed_count: parsed.summary.parsed,
      errors_count: parsed.summary.errors,
      warnings_count: parsed.summary.warnings,
      payload: {
        summary: parsed.summary,
        errors: parsed.errors,
        warnings: parsed.warnings,
        autoCreate,
        source: "cli",
      },
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    process.stderr.write(
      `Could not insert import_jobs row: ${jobErr?.message ?? "unknown"}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`\nStarting commit (import_jobs.id = ${jobRow.id})…\n`);
  const { inserted, failures } = await commitRows(supabase, parsed, !args.noAutoCreate);

  const finalStatus = inserted > 0 ? "committed" : "failed";
  await supabase
    .from("import_jobs")
    .update({
      status: finalStatus,
      inserted_count: inserted,
      committed_at: new Date().toISOString(),
      payload: {
        summary: parsed.summary,
        errors: parsed.errors,
        warnings: parsed.warnings,
        autoCreate,
        failures,
        source: "cli",
      },
    })
    .eq("id", jobRow.id);

  process.stdout.write(
    [
      "",
      "Commit complete.",
      `  inserted: ${inserted}`,
      `  failed:   ${failures.length}`,
      `  total:    ${parsed.consignments.length}`,
      `  import_jobs.id: ${jobRow.id}  (status=${finalStatus})`,
      "",
    ].join("\n"),
  );

  if (failures.length > 0) {
    process.stdout.write("First 10 failures:\n");
    for (const f of failures.slice(0, 10)) {
      process.stdout.write(
        `  row ${f.rowIndex} ${f.ref_no ? `(${f.ref_no}) ` : ""}— ${f.error}\n`,
      );
    }
    if (failures.length > 10) {
      process.stdout.write(`  …and ${failures.length - 10} more (see import_jobs.payload.failures)\n`);
    }
    process.exit(2);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`Unhandled error: ${(e as Error).stack ?? (e as Error).message}\n`);
  process.exit(1);
});
