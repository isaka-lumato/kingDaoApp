import { describe, expect, it } from "vitest";
import { daysBetween, formatDate } from "@/lib/dates";

describe("formatDate", () => {
  it("formats yyyy-MM-dd", () => {
    expect(formatDate("2026-05-18")).toBe("2026-05-18");
  });

  it("renders em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("daysBetween", () => {
  it("computes whole-day difference", () => {
    expect(daysBetween("2026-05-01", "2026-05-08")).toBe(7);
  });

  it("returns null when either side is missing", () => {
    expect(daysBetween(null, "2026-05-08")).toBeNull();
    expect(daysBetween("2026-05-01", null)).toBeNull();
  });
});
