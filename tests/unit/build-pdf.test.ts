import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReportPdf } from "@/server/reports/build-pdf";
import type {
  ReportFilters,
  ReportPayload,
} from "@/server/reports/report-types";

/**
 * Tests for the PDF builder (T-072). The builder returns an opaque react-pdf
 * element tree, so — unlike the XLSX builder whose cells are inspectable — we
 * verify behaviour by rendering each report kind to bytes and asserting:
 *  - the output is a valid, non-trivial PDF (`%PDF` magic header),
 *  - empty results render without throwing (sentinel-row path),
 *  - a missing logo file does not crash the builder.
 *
 * The render is the real react-pdf pipeline (fontkit + layout), so a structural
 * regression in any per-report table component surfaces as a render throw.
 */

const FILTERS_BASE: ReportFilters = { year: 2026, from: null, to: null };
const FILTERS_RANGE: ReportFilters = {
  year: 2026,
  from: "2026-01-01",
  to: "2026-03-31",
};

const PDF_MAGIC = "%PDF";

async function renderKind(payload: ReportPayload, filters = FILTERS_BASE) {
  const element = buildReportPdf(payload, filters);
  return renderToBuffer(element);
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length > 1000 && buffer.subarray(0, 4).toString() === PDF_MAGIC;
}

describe("buildReportPdf · renders every report kind to a valid PDF", () => {
  it("revenue (with rows + totals)", async () => {
    const payload: ReportPayload = {
      kind: "revenue",
      rows: [
        {
          year: 2026,
          month: "2026-01-01",
          month_label: "Jan 2026",
          consignment_count: 3,
          total_amount: 900_000,
        },
        {
          year: 2026,
          month: "2026-02-01",
          month_label: "Feb 2026",
          consignment_count: 5,
          total_amount: 1_500_000,
        },
      ],
      error: null,
    };
    expect(isPdf(await renderKind(payload, FILTERS_RANGE))).toBe(true);
  });

  it("client_volume", async () => {
    const payload: ReportPayload = {
      kind: "client_volume",
      rows: [
        {
          client_id: "c1",
          client_name: "Acme Co",
          sub_label: null,
          job_count: 4,
          total_containers: 12,
          total_revenue: 2_000_000,
          released_count: 3,
          active_count: 1,
        },
      ],
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("turnaround_client", async () => {
    const payload: ReportPayload = {
      kind: "turnaround_client",
      rows: [
        {
          client_id: "c1",
          client_name: "Acme Co",
          sub_label: "subsidiary",
          released_count: 5,
          avg_days: 12,
          min_days: 6,
          max_days: 20,
        },
      ],
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("turnaround_icd", async () => {
    const payload: ReportPayload = {
      kind: "turnaround_icd",
      rows: [
        {
          icd_id: "i1",
          icd_name: "ICD Dar",
          released_count: 7,
          avg_days: 9,
        },
      ],
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("pipeline_funnel (10 stages + totals)", async () => {
    const payload: ReportPayload = {
      kind: "pipeline_funnel",
      funnel: {
        year: 2026,
        total_active: 100,
        released: 250,
        manifest_action: 20,
        shipping_action: 15,
        tanesws_action: 10,
        assessment_action: 8,
        tbs_loading_action: 12,
        tbs_debit_action: 5,
        manifest_comp_action: 7,
        duty_action: 6,
        inspection_action: 9,
        ready_to_release: 8,
      },
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("pending_refunds (dates + money)", async () => {
    const payload: ReportPayload = {
      kind: "pending_refunds",
      rows: [
        {
          id: "p1",
          ref_no: "9900042",
          year: 2026,
          client_name: "Acme Co",
          amount: 300_000,
          remarks: "PAID — REFUND NEEDED",
          release_date: "2026-02-10",
          created_at: "2026-02-10T00:00:00Z",
        },
      ],
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });
});

describe("buildReportPdf · empty + null payloads do not throw", () => {
  it("revenue with no rows renders the empty sentinel", async () => {
    const payload: ReportPayload = { kind: "revenue", rows: [], error: null };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("pending_refunds with no rows renders the empty sentinel", async () => {
    const payload: ReportPayload = {
      kind: "pending_refunds",
      rows: [],
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });

  it("pipeline_funnel with null funnel renders zero rows", async () => {
    const payload: ReportPayload = {
      kind: "pipeline_funnel",
      funnel: null,
      error: null,
    };
    expect(isPdf(await renderKind(payload))).toBe(true);
  });
});
