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
