/**
 * Shared report-kind enum + option metadata.
 *
 * Lives outside `reports-filter-bar.tsx` (which is `"use client"`) so server
 * code — page, route handler, XLSX builder — can import the constants
 * without going through a client-component reference proxy. T-071 surfaced
 * this when the XLSX route handler tried to `REPORT_OPTIONS.map(...)` and
 * got a non-array proxy at server-runtime.
 */

export type ReportKind =
  | "revenue"
  | "client_volume"
  | "turnaround_client"
  | "turnaround_icd"
  | "pipeline_funnel"
  | "pending_refunds";

export const REPORT_OPTIONS: ReadonlyArray<{
  value: ReportKind;
  label: string;
  description: string;
  /**
   * Whether the report's underlying view honours an intra-year date range.
   * Revenue is by-month (filterable by month range); pending refunds carries
   * `release_date`. The other views are year-grain only and ignore from/to.
   */
  dateRangeApplicable: boolean;
}> = [
  {
    value: "revenue",
    label: "Revenue Summary",
    description: "Total release-fees by month for the selected year.",
    dateRangeApplicable: true,
  },
  {
    value: "client_volume",
    label: "Client Volume",
    description: "Containers, jobs, and revenue per client.",
    dateRangeApplicable: false,
  },
  {
    value: "turnaround_client",
    label: "Turnaround Time · by Client",
    description: "Average days from arrival to release, per client.",
    dateRangeApplicable: false,
  },
  {
    value: "turnaround_icd",
    label: "Turnaround Time · by ICD",
    description: "Average days from arrival to release, per ICD.",
    dateRangeApplicable: false,
  },
  {
    value: "pipeline_funnel",
    label: "Pipeline Bottleneck",
    description:
      "Live count of consignments in Action at each stage — where things stall.",
    dateRangeApplicable: false,
  },
  {
    value: "pending_refunds",
    label: "Pending Refunds",
    description:
      "Consignments flagged as PAID / REFUND NEEDED from remarks. Finance queue.",
    dateRangeApplicable: true,
  },
];
