// Excel tracker parser — pure function over CellValue[][].
// SheetJS lives in adapters (T-061 UI, T-062 CLI). See D-035.
//
// Implements PRD §10.3 (parsing rules) and the cross-field validation
// rules from §8.5, §8.19, §8.20. Output is two buckets per D-036:
//   - errors[]: row was NOT included in `consignments`.
//   - warnings[]: row WAS included but has a soft issue worth surfacing.

import type { Database } from "@/types/supabase";

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type CellValue = string | number | boolean | Date | null | undefined;

type ContainerType = Database["public"]["Enums"]["container_type"];
type ManifestStatus = Database["public"]["Enums"]["manifest_status"];
type ShippingBatchStatus = Database["public"]["Enums"]["shipping_batch_status"];
type TaneswsStatus = Database["public"]["Enums"]["tanesws_status"];
type AssessmentStatus = Database["public"]["Enums"]["assessment_status"];
type TbsLoadingStatus = Database["public"]["Enums"]["tbs_loading_status"];
type TbsDebitStatus = Database["public"]["Enums"]["tbs_debit_status"];
type ManifestCompStatus = Database["public"]["Enums"]["manifest_comp_status"];
type DutyStatus = Database["public"]["Enums"]["duty_status"];
type InspectionFileStatus = Database["public"]["Enums"]["inspection_file_status"];
type ReleaseStatus = Database["public"]["Enums"]["release_status"];

export type ParsedConsignment = {
  rowIndex: number;
  year: number;
  ref_no: string;
  tansad_no: string | null;
  serial_no: number | null;
  client_name: string | null;
  bl_number: string | null;
  container_count: number | null;
  container_type: ContainerType | null;
  goods_description: string | null;
  vessel_name: string | null;
  arrival_date: string | null; // ISO yyyy-mm-dd
  icd_name: string | null;
  in_ref: string | null;
  amount: number | null;
  remarks: string | null;

  manifest_status: ManifestStatus;
  shipping_batch_status: ShippingBatchStatus;
  current_status: string | null;
  tanesws_status: TaneswsStatus;
  assessment_status: AssessmentStatus;
  tbs_loading_status: TbsLoadingStatus;
  tbs_debit_status: TbsDebitStatus;
  manifest_comp_status: ManifestCompStatus;
  duty_status: DutyStatus;
  inspection_file_status: InspectionFileStatus;
  release_status: ReleaseStatus;
  release_date: string | null;

  // EFD codes extracted from the EFD CODE cell (one or many — see §10.3).
  // Each is a raw code; the importer creates `efd_records` from these
  // (and may classify as PRIVATE/TRANSIT per the existing efd helpers).
  efd_codes: string[];
  efd_time: string | null; // HH:MM:SS or null
};

export type ParseIssue = {
  rowIndex: number;
  ref_no?: string;
  field?: string;
  message: string;
};

export type ParseSummary = {
  totalRows: number;
  parsed: number;
  skipped: number;
  errors: number;
  warnings: number;
  years: number[];
};

export type ParseResult = {
  consignments: ParsedConsignment[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
  summary: ParseSummary;
};

// ──────────────────────────────────────────────────────────────────────────
// Header map — fuzzy lookup from cell text to logical field.
// Keys are normalised header strings (see normaliseHeader). The order of
// the entries doesn't matter; we build a column-index lookup per section.
// ──────────────────────────────────────────────────────────────────────────

type LogicalField =
  | "ref_no"
  | "tansad_no"
  | "serial_no"
  | "client_name"
  | "bl_number"
  | "container_count"
  | "container_type"
  | "goods_description"
  | "vessel_name"
  | "arrival_date"
  | "icd_name"
  | "in_ref"
  | "amount"
  | "remarks"
  | "manifest_status"
  | "shipping_batch_status"
  | "current_status"
  | "tanesws_status"
  | "assessment_status"
  | "tbs_loading_status"
  | "tbs_debit_status"
  | "manifest_comp_status"
  | "duty_status"
  | "inspection_file_status"
  | "release_status"
  | "release_date"
  | "efd_code"
  | "efd_time";

const HEADER_ALIASES: Record<string, LogicalField> = {
  // Identity
  "ref no": "ref_no",
  "tansad no": "tansad_no",
  "tansad number": "tansad_no",
  "s/n": "serial_no",
  "sn": "serial_no",
  // Party + cargo
  client: "client_name",
  "b/l no": "bl_number",
  "bl no": "bl_number",
  "no of conts": "container_count",
  "no of cont(s)": "container_count",
  "no of containers": "container_count",
  "container type": "container_type",
  "items/goods": "goods_description",
  items: "goods_description",
  goods: "goods_description",
  vessel: "vessel_name",
  "arr date": "arrival_date",
  "arrival date": "arrival_date",
  icd: "icd_name",
  "in ref": "in_ref",
  amount: "amount",
  remarks: "remarks",
  // Pipeline
  manifest: "manifest_status",
  "shipping batch": "shipping_batch_status",
  "current status": "current_status",
  "curent status": "current_status", // real-file typo
  "tanesws loading": "tanesws_status",
  "tanesws loadging": "tanesws_status", // real-file typo
  tanesws: "tanesws_status",
  assment: "assessment_status",
  assessment: "assessment_status",
  "tbs loading": "tbs_loading_status",
  "tbs loadging": "tbs_loading_status", // real-file typo
  "tbs debit": "tbs_debit_status",
  "manifest comp": "manifest_comp_status",
  "duty status": "duty_status",
  "inspection file": "inspection_file_status",
  "inspectione file": "inspection_file_status", // real-file typo
  "release status": "release_status",
  "release date": "release_date",
  // EFD
  "efd code": "efd_code",
  "efd time": "efd_time",
};

const REQUIRED_HEADERS: LogicalField[] = ["ref_no", "container_type"];

// ──────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────

export function parseTracker(rows: CellValue[][]): ParseResult {
  const consignments: ParsedConsignment[] = [];
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const years = new Set<number>();
  let skipped = 0;

  let activeYear: number | null = null;
  let activeHeaderMap: Partial<Record<LogicalField, number>> | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];

    // §10.3 empty-row skip is checked *with* the header map (need ref/tansad
    // column indices), but we can shortcut on totally-blank rows.
    if (isBlankRow(row)) {
      skipped++;
      continue;
    }

    // Year separator: a banner row whose every non-empty cell holds the same
    // 4-digit year. In the real tracker the year is a merged cell smeared
    // across ~20 columns, so this is NOT a single-cell test (D-047).
    // A year banner only flips the active year — it never clears the header,
    // because the file has one header shared across both year sections.
    const yr = detectYearSeparator(row);
    if (yr != null) {
      activeYear = yr;
      years.add(yr);
      skipped++;
      continue;
    }

    // Header row: a row that contains REF No and at least one other known
    // header alias. We scan every non-blank row until one looks like a header.
    // Per D-047 the header may appear BEFORE the first year banner (the real
    // file is title-junk → header → year banner → data), so header discovery
    // is independent of whether a year has been established yet.
    if (activeHeaderMap == null) {
      const map = tryBuildHeaderMap(row);
      if (map) {
        activeHeaderMap = map;
        skipped++;
        continue;
      }
      // Not a header and we have no map yet. Two cases:
      //  - Before any year banner: this is preamble/junk above the header
      //    (e.g. the file's title row) — skip it silently.
      //  - After a year banner but still no header: a real data row that can't
      //    be placed because the section never had a recognisable header —
      //    surface it as an error so rows aren't dropped silently.
      if (activeYear == null) {
        skipped++;
      } else {
        errors.push({
          rowIndex: i,
          message: "Data row before a recognisable header row.",
        });
      }
      continue;
    }

    if (activeYear == null) {
      // Header is known but no year banner has been seen yet. A genuine data
      // row here can't be assigned to a year — surface it as an error.
      errors.push({
        rowIndex: i,
        message: "Data row before any year separator.",
      });
      continue;
    }

    // Actual data row.
    const cell = (f: LogicalField): CellValue =>
      activeHeaderMap![f] != null ? row[activeHeaderMap![f]!] : null;

    const rawRef = stringOf(cell("ref_no"));
    const rawTansad = stringOf(cell("tansad_no"));

    // §10.3: skip rows where REF No and TANSAD No are both blank.
    if (!rawRef && !rawTansad) {
      skipped++;
      continue;
    }

    // §8.20: pad short ref_no with leading 9 + warn.
    const refResult = normaliseRefNo(rawRef);
    if (refResult.error) {
      errors.push({ rowIndex: i, field: "ref_no", message: refResult.error });
      continue;
    }
    const ref_no = refResult.value!;
    if (refResult.warning) {
      warnings.push({
        rowIndex: i,
        ref_no,
        field: "ref_no",
        message: refResult.warning,
      });
    }

    // Container type — required, must be in enum.
    const ctRaw = stringOf(cell("container_type")).toUpperCase();
    const container_type = isContainerType(ctRaw) ? ctRaw : null;
    if (ctRaw && !container_type) {
      errors.push({
        rowIndex: i,
        ref_no,
        field: "container_type",
        message: `Unknown container_type "${ctRaw}" (expected 40FT/20FT/CAR/COIL).`,
      });
      continue;
    }

    // Numeric fields
    const container_count = parseNumber(cell("container_count"));
    const amount = parseNumber(cell("amount"));
    const serial_no = (() => {
      const n = parseNumber(cell("serial_no"));
      return n != null && Number.isInteger(n) ? n : null;
    })();

    // Dates
    const arrival_date = parseDate(cell("arrival_date"));
    const release_date = parseDate(cell("release_date"));

    // EFD cell — may contain multiple comma-separated codes (§10.3).
    const efd_codes = parseEfdCodes(cell("efd_code"));
    const efd_time = parseTime(cell("efd_time"));

    // Pipeline status enum coercion. Unknown values fall back to "Waiting"
    // and surface as warnings — we don't want one stale status string to
    // block an otherwise-good import row.
    const manifest_status = coerceEnum<ManifestStatus>(
      cell("manifest_status"),
      ["Waiting", "Action", "Uploaded"],
      "Waiting",
      i,
      ref_no,
      "manifest_status",
      warnings
    );
    const shipping_batch_status = coerceEnum<ShippingBatchStatus>(
      cell("shipping_batch_status"),
      ["Waiting", "Action", "PREPARED", "W/CARRY IN", "CARRY IN END", "Done"],
      "Waiting",
      i,
      ref_no,
      "shipping_batch_status",
      warnings
    );
    const tanesws_status = coerceEnum<TaneswsStatus>(
      cell("tanesws_status"),
      ["Waiting", "Action", "Done"],
      "Waiting",
      i,
      ref_no,
      "tanesws_status",
      warnings
    );
    const assessment_status = coerceEnum<AssessmentStatus>(
      cell("assessment_status"),
      ["Waiting", "Action", "Closed"],
      "Waiting",
      i,
      ref_no,
      "assessment_status",
      warnings
    );
    const tbs_loading_status = coerceEnum<TbsLoadingStatus>(
      cell("tbs_loading_status"),
      ["Waiting", "Action", "Done"],
      "Waiting",
      i,
      ref_no,
      "tbs_loading_status",
      warnings
    );
    const tbs_debit_status = coerceEnum<TbsDebitStatus>(
      cell("tbs_debit_status"),
      ["Waiting", "Action", "Paid", "SHARED"],
      "Waiting",
      i,
      ref_no,
      "tbs_debit_status",
      warnings
    );
    const manifest_comp_status = coerceEnum<ManifestCompStatus>(
      cell("manifest_comp_status"),
      ["Waiting", "Action", "Done"],
      "Waiting",
      i,
      ref_no,
      "manifest_comp_status",
      warnings
    );
    const duty_status = coerceEnum<DutyStatus>(
      cell("duty_status"),
      ["Waiting", "Action", "Paid"],
      "Waiting",
      i,
      ref_no,
      "duty_status",
      warnings
    );
    const inspection_file_status = coerceEnum<InspectionFileStatus>(
      cell("inspection_file_status"),
      ["Waiting", "Action", "Done", "SHARED"],
      "Waiting",
      i,
      ref_no,
      "inspection_file_status",
      warnings
    );
    const release_status = coerceEnum<ReleaseStatus>(
      cell("release_status"),
      ["Waiting", "Released"],
      "Waiting",
      i,
      ref_no,
      "release_status",
      warnings
    );

    const icd_name = nullableString(cell("icd_name"));

    const parsed: ParsedConsignment = {
      rowIndex: i,
      year: activeYear,
      ref_no,
      tansad_no: nullableString(cell("tansad_no")),
      serial_no,
      client_name: nullableString(cell("client_name")),
      bl_number: nullableString(cell("bl_number")),
      container_count,
      container_type,
      goods_description: nullableString(cell("goods_description")),
      vessel_name: nullableString(cell("vessel_name")),
      arrival_date,
      icd_name,
      in_ref: nullableString(cell("in_ref")),
      amount,
      remarks: nullableString(cell("remarks")),
      manifest_status,
      shipping_batch_status,
      current_status: nullableString(cell("current_status")),
      tanesws_status,
      assessment_status,
      tbs_loading_status,
      tbs_debit_status,
      manifest_comp_status,
      duty_status,
      inspection_file_status,
      release_status,
      release_date,
      efd_codes,
      efd_time,
    };

    // Cross-field soft validations (warnings only, row still imports).

    // §8.5: amount range for container_type + count.
    if (amount != null && container_type) {
      const rangeMsg = checkAmountRange(container_type, container_count, amount);
      if (rangeMsg) {
        warnings.push({
          rowIndex: i,
          ref_no,
          field: "amount",
          message: rangeMsg,
        });
      }
      // §8.5: COIL must go to DP WORLD.
      if (container_type === "COIL" && icd_name && !/dp\s*world/i.test(icd_name)) {
        warnings.push({
          rowIndex: i,
          ref_no,
          field: "icd_name",
          message: `container_type=COIL typically ships to DP WORLD; got "${icd_name}".`,
        });
      }
      // §8.5: CAR + in_ref is contradictory.
      if (container_type === "CAR" && parsed.in_ref) {
        warnings.push({
          rowIndex: i,
          ref_no,
          field: "in_ref",
          message: `container_type=CAR should have no in_ref; got "${parsed.in_ref}".`,
        });
      }
    }

    // §8.19: tanesws=Done but tansad_no missing.
    if (parsed.tanesws_status === "Done" && !parsed.tansad_no) {
      warnings.push({
        rowIndex: i,
        ref_no,
        field: "tansad_no",
        message: "tanesws_status=Done but TANSAD number is missing.",
      });
    }

    consignments.push(parsed);
  }

  return {
    consignments,
    errors,
    warnings,
    summary: {
      totalRows: rows.length,
      parsed: consignments.length,
      skipped,
      errors: errors.length,
      warnings: warnings.length,
      years: Array.from(years).sort((a, b) => a - b),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isBlankRow(row: CellValue[]): boolean {
  return row.every((c) => c == null || (typeof c === "string" && c.trim() === ""));
}

// A year-separator banner: every non-empty cell coerces to the SAME 4-digit
// year in 2000..2100. The real tracker merges the year across ~20 columns, so
// this is not a single-cell test (D-047). A lone year cell still satisfies it,
// so single-cell synthetic test rows continue to work.
function detectYearSeparator(row: CellValue[]): number | null {
  const nonEmpty = row.filter(
    (c) => c != null && !(typeof c === "string" && c.trim() === "")
  );
  if (nonEmpty.length === 0) return null;
  let year: number | null = null;
  for (const v of nonEmpty) {
    const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) return null;
    if (year == null) year = n;
    else if (n !== year) return null;
  }
  return year;
}

function normaliseHeader(s: string): string {
  // Lowercase, strip `.`, `:` and `;` anywhere (real headers in this tracker
  // mix "ARR. DATE", "TANSAD No.", "S/N", and the typo'd "B/L No;" —
  // abbreviation/typo punctuation is noise to the matcher). Embedded newlines
  // (e.g. "No. of\r\nCont(s)") collapse via the \s+ rule. Collapse whitespace,
  // trim.
  return s
    .toLowerCase()
    .replace(/[.:;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tryBuildHeaderMap(
  row: CellValue[]
): Partial<Record<LogicalField, number>> | null {
  const map: Partial<Record<LogicalField, number>> = {};
  let hits = 0;
  for (let col = 0; col < row.length; col++) {
    const raw = row[col];
    if (raw == null || typeof raw !== "string") continue;
    const key = normaliseHeader(raw);
    const field = HEADER_ALIASES[key];
    if (field && map[field] == null) {
      map[field] = col;
      hits++;
    }
  }
  // Strict container-type fallback (D-047): in the real tracker the container
  // type column has NO header — its header cell is merged into "No. of
  // Cont(s)". So if container_type didn't map but container_count did, use the
  // column immediately to the right of the count column. If that column turns
  // out to hold non-enum values, those rows error individually via the
  // per-row container-type guard — no silent mis-mapping.
  if (map.container_type == null && map.container_count != null) {
    map.container_type = map.container_count + 1;
  }
  // Heuristic: a real header row should match at least the required fields
  // plus a handful more. Anything else is a noise row.
  for (const req of REQUIRED_HEADERS) {
    if (map[req] == null) return null;
  }
  if (hits < 5) return null;
  return map;
}

function stringOf(v: CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function nullableString(v: CellValue): string | null {
  const s = stringOf(v);
  return s === "" ? null : s;
}

function parseNumber(v: CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  // Strip currency separators (commas, narrow spaces) before parsing.
  const cleaned = String(v).replace(/[,\s]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Excel stores dates as serial numbers (days since 1899-12-30, accounting for
// the Lotus 1-2-3 leap-year bug). PRD §10.3 explicitly calls this out.
// We accept: number (Excel serial), Date (already parsed by SheetJS cellDates),
// or string (ISO-like, dd/mm/yyyy, or yyyy-mm-dd).
function parseDate(v: CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return toISODate(v);
  if (typeof v === "number") {
    // Excel epoch: 1899-12-30 (corrects for the 1900-Feb-29 bug).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : toISODate(d);
  }
  const s = String(v).trim();
  if (!s) return null;
  // yyyy-mm-dd
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  // Fallback — Date constructor.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

// Decimal time per PRD §10.3 — fraction of a 24h day. 0.5 = 12:00:00.
// Also accepts "HH:MM" / "HH:MM:SS" strings.
function parseTime(v: CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return `${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}:${pad2(v.getUTCSeconds())}`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || v >= 1) return null;
    const totalSec = Math.round(v * 86400);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  const s = String(v).trim();
  const hms = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!hms) return null;
  return `${pad2(hms[1])}:${pad2(hms[2])}:${pad2(hms[3] ?? "00")}`;
}

// §10.3 — EFD cells may contain multiple comma-separated codes. The source
// often abbreviates trailing codes with the shared prefix (e.g.
// "03429127, ..131"). We expand the abbreviated form by reusing the prefix
// of the previous code.
function parseEfdCodes(v: CellValue): string[] {
  const s = stringOf(v);
  if (!s) return [];
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^\.+(\d+)$/.exec(part);
    if (m && out.length > 0) {
      const prev = out[out.length - 1]!;
      const tail = m[1]!;
      // Take the prev's prefix up to where tail-length matches.
      const prefix = prev.slice(0, prev.length - tail.length);
      out.push(prefix + tail);
    } else {
      out.push(part);
    }
  }
  return out;
}

function isContainerType(v: string): v is ContainerType {
  return v === "40FT" || v === "20FT" || v === "CAR" || v === "COIL";
}

function coerceEnum<T extends string>(
  v: CellValue,
  allowed: readonly T[],
  fallback: T,
  rowIndex: number,
  ref_no: string,
  field: string,
  warnings: ParseIssue[]
): T {
  const s = stringOf(v);
  if (!s) return fallback;
  // Exact match first, then case-insensitive whitespace-tolerant match.
  if ((allowed as readonly string[]).includes(s)) return s as T;
  const norm = s.toUpperCase().replace(/\s+/g, " ").trim();
  for (const a of allowed) {
    if (a.toUpperCase().replace(/\s+/g, " ").trim() === norm) return a;
  }
  warnings.push({
    rowIndex,
    ref_no,
    field,
    message: `Unknown ${field} value "${s}"; defaulting to "${fallback}".`,
  });
  return fallback;
}

// §8.20 — ref_no must be 7 digits starting with "99". Pad shorter values
// with leading "9"s and surface as a warning. Longer values or non-numeric
// values are an error.
function normaliseRefNo(
  raw: string
): { value?: string; warning?: string; error?: string } {
  if (!raw) return { error: "ref_no is empty." };
  if (!/^\d+$/.test(raw)) {
    return { error: `ref_no "${raw}" is not numeric.` };
  }
  if (raw.length === 7) {
    if (!raw.startsWith("99")) {
      return {
        value: raw,
        warning: `ref_no "${raw}" does not start with "99" (expected internal format).`,
      };
    }
    return { value: raw };
  }
  if (raw.length > 7) {
    return { error: `ref_no "${raw}" is longer than 7 digits.` };
  }
  // length < 7 → pad with leading "9" per §8.20.
  const padded = "9".repeat(7 - raw.length) + raw;
  return {
    value: padded,
    warning: `ref_no "${raw}" was padded to "${padded}"; verify manually.`,
  };
}

// §8.5 — soft validation of amount range per container_type + count.
// Returns a warning message if outside the documented bands, else null.
function checkAmountRange(
  type: ContainerType,
  count: number | null,
  amount: number
): string | null {
  if (amount <= 0) return `amount ${amount} is not positive.`;
  if (type === "CAR") {
    if (amount < 50_000 || amount > 75_000) {
      return `amount ${amount} TZS is outside CAR range 50,000–75,000.`;
    }
    return null;
  }
  if (type === "COIL") {
    if (count == null || count <= 0) return null;
    // §8.5 observed: ~3,000 TZS per coil unit. Allow ±50% before warning.
    const expected = count * 3000;
    if (amount < expected * 0.5 || amount > expected * 1.5) {
      return `amount ${amount} TZS is far from COIL expected ≈ ${expected} (${count} coils × 3,000).`;
    }
    return null;
  }
  if (type === "20FT") {
    const c = count ?? 1;
    const lo = 150_000 * Math.max(1, c);
    const hi = 250_000 * Math.max(1, c);
    if (amount < lo || amount > hi) {
      return `amount ${amount} TZS is outside 20FT range ${lo}–${hi} for ${c} container(s).`;
    }
    return null;
  }
  // 40FT bands from §8.5.
  const c = count ?? 1;
  const [lo, hi] = bandFor40FT(c);
  if (amount < lo || amount > hi) {
    return `amount ${amount} TZS is outside 40FT range ${lo}–${hi} for ${c} container(s).`;
  }
  return null;
}

function bandFor40FT(count: number): [number, number] {
  if (count <= 1) return [150_000, 200_000];
  if (count === 2) return [200_000, 200_000];
  if (count === 3) return [250_000, 250_000];
  if (count <= 6) return [300_000, 300_000];
  return [300_000, 500_000]; // 7-9 containers per §8.5
}
