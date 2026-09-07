import type { KanbanConsignment } from "@/lib/pipeline";

/**
 * The Matrix is a worksheet, not a stage queue. Keep rows in the same
 * chronological position while their pipeline cells change (D-075).
 *
 * Estimated arrival is captured before processing begins and therefore stays
 * stable through ordinary stage advances. Historical records can lack it, so
 * their actual arrival date is the compatible fallback. A REF No tie-breaker
 * keeps equal/unknown dates deterministic without consulting `updated_at`.
 */
export function sortPipelineMatrixRows(
  rows: KanbanConsignment[],
): KanbanConsignment[] {
  return [...rows].sort((a, b) => {
    const dateA = a.estimated_arrival_date ?? a.arrival_date;
    const dateB = b.estimated_arrival_date ?? b.arrival_date;

    if (dateA && dateB) {
      const byDate = dateA.localeCompare(dateB);
      if (byDate !== 0) return byDate;
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }

    return a.ref_no.localeCompare(b.ref_no, undefined, { numeric: true });
  });
}
