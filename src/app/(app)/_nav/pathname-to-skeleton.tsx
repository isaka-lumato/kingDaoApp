/**
 * Maps a target pathname to the matching loading.tsx skeleton.
 *
 * Used by <NavSkeletonSwap> to paint the next route's skeleton the
 * instant a <Link> is clicked, before the server has responded.
 *
 * Order matters: list specific routes (e.g. /consignments/[id]/edit)
 * before less-specific ones (e.g. /consignments/[id]) so the first
 * match wins.
 */
import type { ReactNode } from "react";

import AppLoading from "../loading";
import DashboardLoading from "../dashboard/loading";
import ConsignmentsLoading from "../consignments/loading";
import ConsignmentDetailLoading from "../consignments/[id]/loading";
import EditConsignmentLoading from "../consignments/[id]/edit/loading";
import NewConsignmentLoading from "../consignments/new/loading";
import EfdLoading from "../efd/loading";
import EfdDetailLoading from "../efd/[id]/loading";
import NewEfdLoading from "../efd/new/loading";
import ImportLoading from "../import/loading";
import InboxLoading from "../inbox/loading";
import ReportsLoading from "../reports/loading";
import SettingsLoading from "../settings/loading";
import RolesLoading from "../settings/roles/loading";
import UsersLoading from "../settings/users/loading";

type Matcher = {
  test: (pathname: string) => boolean;
  skeleton: ReactNode;
};

// Note: `[id]` is matched with a [^/]+ segment so `/consignments/abc/edit`
// resolves to EditConsignmentLoading and `/consignments/abc` resolves to
// ConsignmentDetailLoading. Specific routes appear before their parents.
const MATCHERS: Matcher[] = [
  { test: (p) => p === "/dashboard", skeleton: <DashboardLoading /> },

  {
    test: (p) => /^\/consignments\/[^/]+\/edit$/.test(p),
    skeleton: <EditConsignmentLoading />,
  },
  { test: (p) => p === "/consignments/new", skeleton: <NewConsignmentLoading /> },
  {
    test: (p) => /^\/consignments\/[^/]+$/.test(p),
    skeleton: <ConsignmentDetailLoading />,
  },
  { test: (p) => p === "/consignments", skeleton: <ConsignmentsLoading /> },

  { test: (p) => p === "/efd/new", skeleton: <NewEfdLoading /> },
  { test: (p) => /^\/efd\/[^/]+$/.test(p), skeleton: <EfdDetailLoading /> },
  { test: (p) => p === "/efd", skeleton: <EfdLoading /> },

  { test: (p) => p === "/import", skeleton: <ImportLoading /> },
  { test: (p) => p === "/inbox", skeleton: <InboxLoading /> },
  { test: (p) => p === "/reports", skeleton: <ReportsLoading /> },

  { test: (p) => p === "/settings/users", skeleton: <UsersLoading /> },
  { test: (p) => p === "/settings/roles", skeleton: <RolesLoading /> },
  { test: (p) => p === "/settings", skeleton: <SettingsLoading /> },
];

/**
 * Returns the skeleton to paint while the target pathname is loading.
 *
 * `/` (Kanban) intentionally returns null — the board flash is more
 * jarring than helpful on the homepage; the dynamic-import shell
 * already shows "Loading board…" there.
 *
 * Anything else falls through to the generic AppLoading.
 */
export function pathnameToSkeleton(pathname: string): ReactNode {
  if (pathname === "/") return null;

  for (const { test, skeleton } of MATCHERS) {
    if (test(pathname)) return skeleton;
  }

  return <AppLoading />;
}
