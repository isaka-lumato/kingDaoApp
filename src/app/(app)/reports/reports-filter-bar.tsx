"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { REPORT_OPTIONS, type ReportKind } from "./report-options";

// Re-export so existing imports of this file keep working. The constant +
// type live in the non-`"use client"` `./report-options.ts` so server code
// (route handler, page) can import them too without crossing the client-
// component reference-proxy boundary.
export { REPORT_OPTIONS, type ReportKind };

type Props = {
  report: ReportKind;
  year: number;
  yearOptions: number[];
  from: string | null;
  to: string | null;
};

export default function ReportsFilterBar({
  report,
  year,
  yearOptions,
  from,
  to,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const current = REPORT_OPTIONS.find((r) => r.value === report) ?? REPORT_OPTIONS[0]!;

  function navigate(next: {
    report?: ReportKind;
    year?: number;
    from?: string;
    to?: string;
  }) {
    const params = new URLSearchParams();
    params.set("report", next.report ?? report);
    params.set("year", String(next.year ?? year));
    const nextFrom = next.from !== undefined ? next.from : from ?? "";
    const nextTo = next.to !== undefined ? next.to : to ?? "";
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    startTransition(() => {
      router.push(`/reports?${params.toString()}`);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Report selector */}
        <div className="md:col-span-6">
          <label
            htmlFor="report-select"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1"
          >
            Report
          </label>
          <select
            id="report-select"
            value={report}
            onChange={(e) => navigate({ report: e.target.value as ReportKind })}
            disabled={isPending}
            className="w-full rounded-md border border-border bg-background text-foreground px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {REPORT_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div className="md:col-span-2">
          <label
            htmlFor="year-select"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1"
          >
            Year
          </label>
          <select
            id="year-select"
            value={year}
            onChange={(e) => navigate({ year: parseInt(e.target.value, 10) })}
            disabled={isPending}
            className="w-full rounded-md border border-border bg-background text-foreground px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* From / To — only meaningful for revenue + pending_refunds */}
        <div className="md:col-span-2">
          <label
            htmlFor="date-from"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1"
          >
            From
          </label>
          <input
            id="date-from"
            type="date"
            value={from ?? ""}
            onChange={(e) => navigate({ from: e.target.value })}
            disabled={isPending || !current.dateRangeApplicable}
            className="w-full rounded-md border border-border bg-background text-foreground px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="date-to"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1"
          >
            To
          </label>
          <input
            id="date-to"
            type="date"
            value={to ?? ""}
            onChange={(e) => navigate({ to: e.target.value })}
            disabled={isPending || !current.dateRangeApplicable}
            className="w-full rounded-md border border-border bg-background text-foreground px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">{current.description}</p>
        {!current.dateRangeApplicable && (
          <span className="text-[11px] text-muted-foreground italic">
            Date range not applicable — this report is aggregated by year.
          </span>
        )}
        {(from || to) && current.dateRangeApplicable && (
          <button
            type="button"
            onClick={() => navigate({ from: "", to: "" })}
            className="text-[11px] text-brand hover:underline"
          >
            Clear date range
          </button>
        )}
      </div>
    </div>
  );
}
