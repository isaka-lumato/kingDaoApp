import { describe, expect, it } from "vitest";
import { formatTzs } from "@/lib/money";

describe("formatTzs", () => {
  it("formats whole shillings without decimals", () => {
    const out = formatTzs(300_000);
    expect(out).toContain("300,000");
  });

  it("handles bigint", () => {
    const out = formatTzs(1_473_000n);
    expect(out).toContain("1,473,000");
  });

  it("renders em-dash for null/undefined", () => {
    expect(formatTzs(null)).toBe("—");
    expect(formatTzs(undefined)).toBe("—");
  });
});
