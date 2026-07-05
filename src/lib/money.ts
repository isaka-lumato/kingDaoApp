/**
 * Tanzanian Shilling formatting. Per D-017, amounts are stored as bigint whole
 * shillings. Use these helpers everywhere money is displayed — never call
 * Intl.NumberFormat inline.
 */

const formatter = new Intl.NumberFormat("en-TZ", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("en-TZ", {
  style: "currency",
  currency: "TZS",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTzs(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return formatter.format(typeof amount === "bigint" ? Number(amount) : amount);
}

export function formatTzsCompact(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return compactFormatter.format(
    typeof amount === "bigint" ? Number(amount) : amount,
  );
}

/** Placeholder shown to roles without the "See financial amounts" permission. */
export const MASKED_AMOUNT = "•••";

/**
 * Formats an amount, but returns a masked placeholder when the caller lacks the
 * "See financial amounts" read permission (D-063). Keeps table/detail layouts
 * stable — the value is hidden, not the column.
 */
export function maskedTzs(
  amount: bigint | number | null | undefined,
  canSee: boolean,
): string {
  if (!canSee) return MASKED_AMOUNT;
  return formatTzs(amount);
}
