import { describe, expect, it } from "vitest";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  isStageComplete,
  resolveActiveStage,
  type StageField,
  type KanbanConsignment,
} from "@/lib/pipeline";

function mockConsignment(overrides: Partial<KanbanConsignment> = {}): KanbanConsignment {
  const baseStages = {} as Record<StageField, string>;
  for (const s of PIPELINE_STAGES) {
    baseStages[s.field] = s.validValues[0]; // "Waiting"
  }

  return {
    id: "mock-1",
    ref_no: "9900142",
    year: 2026,
    goods_description: "2015 Toyota Harrier",
    vessel_name: "MSC ANNA",
    bl_number: "MEDU8829102",
    arrival_date: "2026-08-20",
    estimated_arrival_date: null,
    consignment_nature: "Import",
    tansad_no: "TZ-2026-990142",
    ucr_no: null,
    cargo_count: 1,
    cargo_type: "CAR",
    amount: 65000,
    efd_receipt_no: null,
    remarks: null,
    client_name: "JOYCE CO. LTD",
    ...baseStages,
    active_stage: "manifest_status",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Pipeline Matrix Logic", () => {
  it("determines previous completed stages vs active stage correctly", () => {
    // Stage 1 (manifest) completed, Stage 2 (tanesws) in action
    const item = mockConsignment({
      manifest_status: "Uploaded",
      tanesws_status: "Action",
    });

    const activeStage = resolveActiveStage(item as unknown as Record<string, string>, item.consignment_nature);
    expect(activeStage).toBe("tanesws_status");

    // Manifest stage is completed
    expect(isStageComplete("manifest_status", item.manifest_status)).toBe(true);
    // Tanesws stage is NOT completed yet
    expect(isStageComplete("tanesws_status", item.tanesws_status)).toBe(false);
    // Shipping batch is waiting
    expect(isStageComplete("shipping_batch_status", item.shipping_batch_status)).toBe(false);
  });

  it("handles terminal release state", () => {
    const allDoneStages = {} as Record<StageField, string>;
    for (const s of PIPELINE_STAGES) {
      allDoneStages[s.field] = s.doneValue;
    }

    const item = mockConsignment({
      ...allDoneStages,
    });

    const activeStage = resolveActiveStage(item as unknown as Record<string, string>, item.consignment_nature);
    expect(activeStage).toBe("release_status");
    expect(item.release_status).toBe(STAGE_DONE_VALUE.release_status);
    expect(isStageComplete("release_status", item.release_status)).toBe(true);
  });

  it("identifies stuck consignment when updated_at exceeds 48 hours in active state", () => {
    const staleTime = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
    const stuckItem = mockConsignment({
      manifest_status: "Action",
      updated_at: staleTime,
    });

    const isStuck =
      stuckItem.release_status !== "Released" &&
      Date.now() - Date.parse(stuckItem.updated_at) > 48 * 3600 * 1000;

    expect(isStuck).toBe(true);
  });
});
