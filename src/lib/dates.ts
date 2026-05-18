import { format, formatDistanceToNow, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * All timestamps stored as UTC; all display in Africa/Dar_es_Salaam (D-008).
 * Use these helpers instead of inline date-fns calls so the timezone never drifts.
 */

export const TZ = "Africa/Dar_es_Salaam";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "yyyy-MM-dd");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return formatInTimeZone(d, TZ, "yyyy-MM-dd HH:mm");
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Days elapsed between two date-only values, e.g. arrival_date → release_date
 * for turnaround time (PRD §8.13). Returns null if either is missing.
 */
export function daysBetween(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): number | null {
  if (!from || !to) return null;
  const a = typeof from === "string" ? parseISO(from) : from;
  const b = typeof to === "string" ? parseISO(to) : to;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
