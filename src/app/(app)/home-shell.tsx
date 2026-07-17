"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { StageField, KanbanConsignment } from "@/lib/pipeline";
import type { IntakeIcd } from "@/components/intake-dialog";
import { useConsignmentsRealtime } from "@/hooks/use-consignments-realtime";
import KanbanBoardClient from "./kanban-board-client";
import TriageView from "./triage-view";

type Tab = "triage" | "kanban";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
  /** ICDs for the Manifest drop-popup (D-071); board-only. */
  icds?: IntakeIcd[];
};

// Tailwind `md` = 768px.
const MD = "(min-width: 768px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MD);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getSnapshot() {
  return window.matchMedia(MD).matches;
}
function getServerSnapshot() {
  // SSR can't know the viewport. Default to desktop so the SSR'd markup
  // matches the most common case; mobile users will swap to triage on
  // first client render.
  return true;
}

export default function HomeShell({ icds, ...props }: Props) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Explicit user override of the auto-default. Null = follow viewport.
  const [override, setOverride] = useState<Tab | null>(null);
  const tab: Tab = override ?? (isDesktop ? "kanban" : "triage");
  const setTab = (t: Tab) => setOverride(t);
  const router = useRouter();

  // Live updates (D-057). The kanban/triage views are RSC-props + useOptimistic,
  // not query-backed, so we refresh the server tree on another user's change.
  // Debounced so a burst of events (e.g. a multi-stage advance) triggers one
  // refresh; the actor's own drag is already reflected optimistically.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteChange = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);
  useConsignmentsRealtime(onRemoteChange);

  return (
    <div className="flex flex-col gap-3 h-full">
      {isDesktop && (
        <div className="flex items-center gap-1 self-start rounded-lg border border-border bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("kanban")}
            className={[
              "px-3 py-1 rounded-md transition-colors",
              tab === "kanban"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setTab("triage")}
            className={[
              "px-3 py-1 rounded-md transition-colors",
              tab === "triage"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            Triage
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {tab === "kanban" ? (
          <KanbanBoardClient {...props} icds={icds} />
        ) : (
          <TriageView {...props} icds={icds} />
        )}
      </div>
    </div>
  );
}
