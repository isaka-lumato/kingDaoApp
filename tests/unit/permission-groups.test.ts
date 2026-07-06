import { describe, expect, it } from "vitest";
import {
  PERMISSION_GROUPS,
  isKnownPermissionTarget,
  writeGroupCount,
} from "@/lib/permission-groups";

describe("permission groups", () => {
  it("uses unique group ids and non-empty column targets", () => {
    const ids = new Set<string>();

    for (const group of PERMISSION_GROUPS) {
      expect(group.id).toMatch(/^[a-z0-9_]+$/);
      expect(ids.has(group.id)).toBe(false);
      expect(group.columns.length).toBeGreaterThan(0);
      ids.add(group.id);

      for (const target of group.columns) {
        expect(target.table).toMatch(/^[a-z_]+$/);
        expect(target.column).toMatch(/^[a-z_]+$/);
        expect(isKnownPermissionTarget(target.table, target.column)).toBe(true);
      }
    }
  });

  it("does not allow stale consignment column names", () => {
    expect(isKnownPermissionTarget("consignments", "container_count")).toBe(false);
    expect(isKnownPermissionTarget("consignments", "container_type")).toBe(false);
    expect(isKnownPermissionTarget("consignments", "in_ref")).toBe(false);
  });

  it("counts enabled write groups only when every target is writable", () => {
    expect(
      writeGroupCount([
        {
          table_name: "consignments",
          column_name: "amount",
          can_write: true,
        },
      ]),
    ).toBe(1);

    expect(
      writeGroupCount([
        {
          table_name: "efd_records",
          column_name: "efd_code",
          can_write: true,
        },
      ]),
    ).toBe(0);
  });
});
