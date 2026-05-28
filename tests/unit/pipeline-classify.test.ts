import { describe, expect, it } from "vitest";
import { classifyConsignment, PIPELINE_STAGES, type StageField } from "@/lib/pipeline";

const NOW = new Date("2026-05-28T12:00:00Z");
const RECENT = "2026-05-28T11:00:00Z"; // 1h ago — not stuck
const STALE = "2026-05-25T11:00:00Z"; // 73h ago — stuck

// Build a row with all stages at their doneValue, then let the caller override.
function row(overrides: Partial<Record<StageField, string>> & {
  arrival_date?: string | null;
  updated_at?: string;
}) {
  const base = {} as Record<StageField, string>;
  for (const s of PIPELINE_STAGES) base[s.field] = s.doneValue;
  return {
    ...base,
    arrival_date: overrides.arrival_date === undefined ? "2026-05-01" : overrides.arrival_date,
    updated_at: overrides.updated_at ?? RECENT,
    ...overrides,
  };
}

describe("classifyConsignment", () => {
  it("fully-released row → done", () => {
    const r = classifyConsignment(row({}), NOW);
    expect(r.bucket).toBe("done");
    expect(r.activeStage).toBeNull();
    expect(r.isStuck).toBe(false);
  });

  it("null arrival_date forces waiting + Awaiting arrival subtitle", () => {
    const r = classifyConsignment(row({ arrival_date: null }), NOW);
    expect(r.bucket).toBe("waiting");
    expect(r.isAwaitingArrival).toBe(true);
    expect(r.subtitleLabel).toBe("Awaiting arrival");
  });

  it("active stage = Action → action bucket", () => {
    const r = classifyConsignment(
      row({ manifest_status: "Action" }),
      NOW,
    );
    expect(r.bucket).toBe("action");
    expect(r.activeStage).toBe("manifest_status");
    expect(r.subtitleLabel).toBe("Manifest");
    expect(r.isStuck).toBe(false);
  });

  it("active stage = Waiting → waiting bucket", () => {
    const r = classifyConsignment(
      row({ manifest_status: "Waiting" }),
      NOW,
    );
    expect(r.bucket).toBe("waiting");
    expect(r.activeStage).toBe("manifest_status");
  });

  it.each(["PREPARED", "W/CARRY IN", "CARRY IN END"])(
    "shipping_batch intermediate %s → action bucket",
    (val) => {
      const r = classifyConsignment(
        row({ manifest_status: "Uploaded", shipping_batch_status: val }),
        NOW,
      );
      expect(r.bucket).toBe("action");
      expect(r.activeStage).toBe("shipping_batch_status");
    },
  );

  it("SHARED on inspection_file_status → action bucket", () => {
    const r = classifyConsignment(
      row({ inspection_file_status: "SHARED" }),
      NOW,
    );
    expect(r.bucket).toBe("action");
    expect(r.activeStage).toBe("inspection_file_status");
  });

  it("action bucket + updated_at > 48h ago → isStuck", () => {
    const r = classifyConsignment(
      row({ manifest_status: "Action", updated_at: STALE }),
      NOW,
    );
    expect(r.bucket).toBe("action");
    expect(r.isStuck).toBe(true);
  });

  it("waiting bucket never marks stuck (PRD §6.8 only applies to Action)", () => {
    const r = classifyConsignment(
      row({ manifest_status: "Waiting", updated_at: STALE }),
      NOW,
    );
    expect(r.bucket).toBe("waiting");
    expect(r.isStuck).toBe(false);
  });

  it("active stage skips past stages that are at doneValue", () => {
    const r = classifyConsignment(
      row({
        manifest_status: "Uploaded",
        shipping_batch_status: "Done",
        tanesws_status: "Action",
      }),
      NOW,
    );
    expect(r.activeStage).toBe("tanesws_status");
    expect(r.bucket).toBe("action");
  });

  it("release stage at Waiting → waiting bucket, not done", () => {
    const r = classifyConsignment(row({ release_status: "Waiting" }), NOW);
    expect(r.bucket).toBe("waiting");
    expect(r.activeStage).toBe("release_status");
  });
});
