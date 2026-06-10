// Translate raw Postgres errors into messages an everyday user can act on,
// so forms never surface developer-facing text like
// 'null value in column "..." violates not-null constraint'.

type PgError = { code?: string; message: string };

export function friendlyConsignmentDbError(error: PgError): string {
  // 23505 unique_violation — bl_number is unique per year (PRD §8.2).
  if (error.code === "23505" && error.message.includes("bl_number")) {
    return "A consignment with this B/L number already exists for the selected year.";
  }
  if (error.code === "23505") {
    return "This consignment duplicates an existing record. Please check your entries.";
  }
  // 23502 not_null_violation, 23514 check_violation — a required value was missing or out of range.
  if (error.code === "23502" || error.code === "23514") {
    return "Some required details are missing or invalid. Please review the form and try again.";
  }
  // Fallback: don't leak raw SQL — keep it generic but reassuring.
  return "Sorry, we couldn't save this consignment. Please check your entries and try again.";
}
