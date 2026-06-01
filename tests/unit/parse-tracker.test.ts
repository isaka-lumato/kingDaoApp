import { describe, it, expect } from "vitest";
import {
  parseTracker,
  type CellValue,
} from "@/server/import/parse-tracker";

// A canonical header row that matches the live tracker layout closely
// enough for tests. Column positions don't matter to the parser (it's
// header-driven per D-036), but order here mirrors the real file for
// readability.
const HEADER: CellValue[] = [
  "S/N",
  "REF No",
  "TANSAD No.",
  "CLIENT",
  "B/L No.",
  "No. of Cont(s)",
  "Container Type",
  "ITEMS/GOODS",
  "VESSEL",
  "ARR. DATE",
  "ICD",
  "IN REF",
  "AMOUNT",
  "Manifest",
  "Shipping Batch",
  "CURRENT STATUS",
  "TANESWS Loading",
  "ASSMENT",
  "TBS Loading",
  "TBS Debit",
  "Manifest Comp",
  "Duty Status",
  "Inspection File",
  "Release Status",
  "Release Date",
  "EFD CODE",
  "EFD TIME",
  "Remarks",
];

// Build a row in the same column order as HEADER. Pass undefined for
// columns you don't care about.
function row(values: Partial<Record<string, CellValue>>): CellValue[] {
  const map: Record<string, number> = {};
  HEADER.forEach((h, i) => {
    if (typeof h === "string") map[h] = i;
  });
  const out: CellValue[] = new Array(HEADER.length).fill(null);
  for (const [k, v] of Object.entries(values)) {
    const idx = map[k];
    if (idx != null) out[idx] = v ?? null;
  }
  return out;
}

// Minimal valid 40FT consignment row (passes all hard rules + amount band).
function validRow(overrides: Partial<Record<string, CellValue>> = {}): CellValue[] {
  return row({
    "S/N": 1,
    "REF No": "9900001",
    "TANSAD No.": "1500000",
    CLIENT: "TZ CHINA",
    "B/L No.": "MEDU123",
    "No. of Cont(s)": 1,
    "Container Type": "40FT",
    "ITEMS/GOODS": "tyres",
    VESSEL: "MV TEST",
    "ARR. DATE": "2026-01-15",
    ICD: "GALCO",
    "IN REF": "TZ3",
    AMOUNT: 180_000,
    Manifest: "Uploaded",
    "Shipping Batch": "Done",
    "TANESWS Loading": "Done",
    ASSMENT: "Closed",
    "TBS Loading": "Done",
    "TBS Debit": "Paid",
    "Manifest Comp": "Done",
    "Duty Status": "Paid",
    "Inspection File": "Done",
    "Release Status": "Released",
    "Release Date": "2026-02-01",
    "EFD CODE": "03429127",
    "EFD TIME": "10:30:00",
    ...overrides,
  });
}

describe("parseTracker — year separators", () => {
  it("flips active year on a single-cell year row", () => {
    const rows: CellValue[][] = [
      [2026, null, null, null], // year separator
      HEADER,
      validRow({ "REF No": "9900001" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.consignments[0]!.year).toBe(2026);
    expect(r.summary.years).toEqual([2026]);
  });

  it("emits an error for data rows before any year separator", () => {
    const rows: CellValue[][] = [HEADER, validRow()];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.message).toMatch(/year separator/i);
  });

  it("supports two yearly sections with separate header rows", () => {
    const rows: CellValue[][] = [
      [2025],
      HEADER,
      validRow({ "REF No": "9900001" }),
      [2026],
      HEADER,
      validRow({ "REF No": "9900002" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(2);
    expect(r.consignments[0]!.year).toBe(2025);
    expect(r.consignments[1]!.year).toBe(2026);
    expect(r.summary.years).toEqual([2025, 2026]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Real source-file structure (D-047). The live TRACKER -- KDL.xlsx has:
//   title-junk row → ONE header → merged year banner → data → next banner.
// The year is a merged cell repeated across ~20 columns, the container-type
// column has no header (merged into "No. of Cont(s)"), and the 2026 section
// reuses the single header. These tests mirror that shape synthetically.
// ──────────────────────────────────────────────────────────────────────────

// A full-width year banner: the year repeated across N columns (mimics the
// merged cell SheetJS unrolls into repeated values).
function yearBanner(year: number, width = HEADER.length): CellValue[] {
  return new Array(width).fill(year);
}

describe("parseTracker — real file structure (D-047)", () => {
  it("treats a full-width repeated-year row as a year banner", () => {
    const rows: CellValue[][] = [
      HEADER,
      yearBanner(2025),
      validRow({ "REF No": "9900001" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.consignments[0]!.year).toBe(2025);
    expect(r.summary.years).toEqual([2025]);
  });

  it("accepts the header BEFORE the year banner", () => {
    const rows: CellValue[][] = [
      HEADER, // header first
      yearBanner(2025),
      validRow(),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });

  it("keeps one sticky header across two year banners (no second header)", () => {
    const rows: CellValue[][] = [
      HEADER, // single header for the whole file
      yearBanner(2025),
      validRow({ "REF No": "9900001" }),
      yearBanner(2026), // no header beneath this banner
      validRow({ "REF No": "9900002" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(2);
    expect(r.consignments[0]!.year).toBe(2025);
    expect(r.consignments[1]!.year).toBe(2026);
    expect(r.summary.years).toEqual([2025, 2026]);
  });

  it("skips a title-junk preamble row above the header (not an error)", () => {
    const rows: CellValue[][] = [
      [" import consignmets status", null, null, 91439000], // junk row 0
      HEADER,
      yearBanner(2025),
      validRow(),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
    expect(r.summary.skipped).toBeGreaterThanOrEqual(1);
  });

  it("infers a header-less container-type column right of the count column", () => {
    // Build a header where the container-type cell is blank (merged away),
    // exactly as in the real file: col after "No. of Cont(s)" is empty.
    const HEADER_NO_CT: CellValue[] = HEADER.map((h) =>
      h === "Container Type" ? null : h
    );
    // Place 40FT in the column that follows the count column.
    const countIdx = HEADER.indexOf("No. of Cont(s)");
    const dataRow = validRow();
    dataRow[countIdx + 1] = "40FT"; // the unlabeled container-type column
    const rows: CellValue[][] = [HEADER_NO_CT, yearBanner(2025), dataRow];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.consignments[0]!.container_type).toBe("40FT");
  });

  it("maps real-file header typos (CURENT/Loadging/B-L No;)", () => {
    const HEADER_TYPOS: CellValue[] = HEADER.map((h) => {
      switch (h) {
        case "CURRENT STATUS":
          return "CURENT STATUS";
        case "TANESWS Loading":
          return "TANESWS Loadging";
        case "TBS Loading":
          return "TBS Loadging";
        case "Inspection File":
          return "Inspectione file";
        case "B/L No.":
          return "B/L No;";
        default:
          return h;
      }
    });
    const rows: CellValue[][] = [HEADER_TYPOS, yearBanner(2025), validRow()];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.consignments[0]!.bl_number).toBe("MEDU123");
  });
});

describe("parseTracker — empty row skip (§10.3)", () => {
  it("skips totally-blank rows", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      [null, null, null, null, null],
      validRow(),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.summary.skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips rows where REF No and TANSAD No are both blank", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      row({ CLIENT: "TZ CHINA", AMOUNT: 999 }), // ref + tansad blank
      validRow(),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });
});

describe("parseTracker — Excel serial dates (§10.3)", () => {
  it("converts an Excel serial to ISO date", () => {
    // Excel epoch is 1899-12-30. 45792 → 2025-05-15:
    //   2025-01-01 = serial 45658; +31 (Jan) +28 (Feb) +31 (Mar) +30 (Apr)
    //   +14 = serial 45792 = 2025-05-15.
    const rows: CellValue[][] = [
      [2025],
      HEADER,
      validRow({ "ARR. DATE": 45792 }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.arrival_date).toBe("2025-05-15");
  });

  it("accepts dd/mm/yyyy string dates", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "ARR. DATE": "15/01/2026" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.arrival_date).toBe("2026-01-15");
  });

  it("accepts a Date object directly", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "ARR. DATE": new Date(Date.UTC(2026, 0, 15)) }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.arrival_date).toBe("2026-01-15");
  });
});

describe("parseTracker — decimal time (§10.3)", () => {
  it("converts 0.5 to 12:00:00", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "EFD TIME": 0.5 }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.efd_time).toBe("12:00:00");
  });

  it("accepts HH:MM strings and pads to HH:MM:SS", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "EFD TIME": "9:05" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.efd_time).toBe("09:05:00");
  });
});

describe("parseTracker — multi-EFD cells (§10.3)", () => {
  it("splits comma-separated EFD codes", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "EFD CODE": "03429127, 03429131" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.efd_codes).toEqual(["03429127", "03429131"]);
  });

  it("expands abbreviated prefix form '..131'", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "EFD CODE": "03429127, ..131" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.efd_codes).toEqual(["03429127", "03429131"]);
  });

  it("returns empty array for blank EFD cell", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "EFD CODE": "" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.efd_codes).toEqual([]);
  });
});

describe("parseTracker — REF No padding (§8.20)", () => {
  it("pads a 6-digit ref_no to 7 and warns", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "REF No": "900282" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.ref_no).toBe("9900282");
    expect(r.warnings.some((w) => w.field === "ref_no")).toBe(true);
  });

  it("errors on non-numeric ref_no", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "REF No": "ABC123" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(0);
    expect(r.errors.some((e) => e.field === "ref_no")).toBe(true);
  });

  it("errors on ref_no longer than 7 digits", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "REF No": "99000001" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(0);
    expect(r.errors.some((e) => e.field === "ref_no")).toBe(true);
  });
});

describe("parseTracker — container_type validation", () => {
  it("rejects unknown container_type", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "Container Type": "BIG" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(0);
    expect(r.errors.some((e) => e.field === "container_type")).toBe(true);
  });

  it("accepts lowercased '40ft' and normalises", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "Container Type": "40ft" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.container_type).toBe("40FT");
  });
});

describe("parseTracker — §8.5 cross-field warnings", () => {
  it("warns when 40FT amount is outside the band for the container count", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "No. of Cont(s)": 1, AMOUNT: 80_000 }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1); // row still imports
    expect(r.warnings.some((w) => w.field === "amount")).toBe(true);
  });

  it("warns when CAR has an in_ref set", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({
        "Container Type": "CAR",
        "No. of Cont(s)": 1,
        AMOUNT: 60_000,
        "IN REF": "TZ3",
      }),
    ];
    const r = parseTracker(rows);
    expect(r.warnings.some((w) => w.field === "in_ref")).toBe(true);
  });

  it("warns when COIL ships to an ICD other than DP WORLD", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({
        "Container Type": "COIL",
        "No. of Cont(s)": 319,
        AMOUNT: 957_000,
        ICD: "GALCO",
      }),
    ];
    const r = parseTracker(rows);
    expect(r.warnings.some((w) => w.field === "icd_name")).toBe(true);
  });
});

describe("parseTracker — §8.19 TANSAD missing warning", () => {
  it("warns when tanesws=Done but tansad_no blank", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "TANSAD No.": "", "TANESWS Loading": "Done" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.warnings.some((w) => w.field === "tansad_no")).toBe(true);
  });
});

describe("parseTracker — pipeline enum coercion", () => {
  it("defaults unknown manifest values to Waiting with a warning", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ Manifest: "Sent" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.manifest_status).toBe("Waiting");
    expect(r.warnings.some((w) => w.field === "manifest_status")).toBe(true);
  });

  it("accepts whitespace-tolerant shipping_batch values", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ "Shipping Batch": "carry  in  end" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.shipping_batch_status).toBe("CARRY IN END");
  });

  it("treats blank pipeline cells as Waiting silently", () => {
    const rows: CellValue[][] = [
      [2026],
      HEADER,
      validRow({ Manifest: "", "TANESWS Loading": "" }),
    ];
    const r = parseTracker(rows);
    expect(r.consignments[0]!.manifest_status).toBe("Waiting");
    expect(r.consignments[0]!.tanesws_status).toBe("Waiting");
    expect(r.warnings).toHaveLength(0);
  });
});

describe("parseTracker — header resolution (D-036)", () => {
  it("matches headers case-insensitively and tolerates trailing punctuation", () => {
    // Use a header row with varied casing + extra punctuation; parser must
    // still build a valid map and parse the data row beneath it.
    const HEADER_VARIED: CellValue[] = HEADER.map((h) =>
      typeof h === "string" ? h.toLowerCase() + ":" : h
    );
    const rows: CellValue[][] = [[2026], HEADER_VARIED, validRow()];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(1);
    expect(r.consignments[0]!.ref_no).toBe("9900001");
  });

  it("errors when the header row is missing required columns", () => {
    // Drop REF No from the header.
    const BAD: CellValue[] = HEADER.map((h) =>
      h === "REF No" ? "OTHER COL" : h
    );
    const rows: CellValue[][] = [[2026], BAD, validRow()];
    const r = parseTracker(rows);
    expect(r.consignments).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("parseTracker — summary counts", () => {
  it("reports parsed / skipped / errors / warnings totals", () => {
    const rows: CellValue[][] = [
      [2026], // skipped (year sep)
      HEADER, // skipped (header)
      validRow({ "REF No": "9900001" }), // parsed
      [null, null, null], // skipped (blank)
      validRow({ "REF No": "ABC" }), // error
      validRow({ "REF No": "9900002", "No. of Cont(s)": 1, AMOUNT: 9_999 }), // parsed + warning (amount band)
    ];
    const r = parseTracker(rows);
    expect(r.summary.parsed).toBe(2);
    expect(r.summary.errors).toBe(1);
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.summary.skipped).toBeGreaterThanOrEqual(2);
    expect(r.summary.years).toEqual([2026]);
  });
});
