"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  classifyConsignment,
  type KanbanConsignment,
  type StageField,
  type TriageBucket,
} from "@/lib/pipeline";
import StageActionShell from "@/components/stage-action-shell";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
};

type ClassifiedRow = KanbanConsignment & {
  bucket: TriageBucket;
  isStuck: boolean;
  isAwaitingArrival: boolean;
  subtitleLabel: string;
};

const SECTIONS: { bucket: TriageBucket; title: string; defaultOpen: boolean }[] = [
  { bucket: "action", title: "Action Needed", defaultOpen: true },
  { bucket: "waiting", title: "Waiting", defaultOpen: false },
  { bucket: "done", title: "Done", defaultOpen: false },
];

export default function TriageView({ byStage, year, fetchError }: Props) {
  const rows = useMemo<ClassifiedRow[]>(() => {
    const flat = Object.values(byStage).flat();
    return flat.map((c) => {
      const cls = classifyConsignment(c);
      return {
        ...c,
        bucket: cls.bucket,
        isStuck: cls.isStuck,
        isAwaitingArrival: cls.isAwaitingArrival,
        subtitleLabel: cls.subtitleLabel,
      };
    });
  }, [byStage]);

  const grouped = useMemo(() => {
    const g: Record<TriageBucket, ClassifiedRow[]> = {
      action: [],
      waiting: [],
      done: [],
    };
    for (const r of rows) g[r.bucket].push(r);
    // Action: stuck first, then most recently updated last (oldest first so
    // staff see what they've ignored).
    g.action.sort((a, b) => {
      if (a.isStuck !== b.isStuck) return a.isStuck ? -1 : 1;
      return a.updated_at.localeCompare(b.updated_at);
    });
    g.waiting.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    g.done.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return g;
  }, [rows]);

  const [openSet, setOpenSet] = useState<Set<TriageBucket>>(
    () => new Set(SECTIONS.filter((s) => s.defaultOpen).map((s) => s.bucket)),
  );
  function toggle(b: TriageBucket) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Triage
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {grouped.action.length} action · {grouped.waiting.length} waiting ·{" "}
            {grouped.done.length} done · {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {yearOptions.map((y) => (
              <Link
                key={y}
                href={`/?year=${y}`}
                className={[
                  "px-3 py-1.5 transition-colors",
                  y === year
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-card text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {y}
              </Link>
            ))}
          </div>
          <Link
            href="/consignments/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </Link>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="space-y-3">
        {SECTIONS.map((s) => {
          const open = openSet.has(s.bucket);
          const list = grouped[s.bucket];
          return (
            <section
              key={s.bucket}
              className="rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => toggle(s.bucket)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "w-2 h-2 rounded-full",
                      s.bucket === "action"
                        ? "bg-stage-action"
                        : s.bucket === "waiting"
                          ? "bg-stage-waiting"
                          : "bg-stage-done",
                    ].join(" ")}
                  />
                  <h2 className="text-sm font-semibold text-foreground">
                    {s.title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {list.length}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-border/60 border-t border-border/60">
                  {list.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Nothing here.
                    </li>
                  )}
                  {list.map((row) => (
                    <li key={row.id}>
                      <StageActionShell
                        consignment={row}
                        triggerClassName="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                        trigger={
                          <>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-foreground">
                                  {row.ref_no}
                                </span>
                                {row.isStuck && (
                                  <span className="text-[10px] font-semibold text-stage-stuck">
                                    ⚠ STUCK
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-foreground/80 truncate mt-0.5">
                                {row.client_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {row.subtitleLabel}
                                {row.vessel_name ? ` · ${row.vessel_name}` : ""}
                              </p>
                            </div>
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
