import type { Database } from "@/types/supabase";

export type CargoType = Database["public"]["Enums"]["cargo_type"];

// Order matches the cargo-type dropdown shown on the consignment forms.
export const CARGO_TYPES: readonly CargoType[] = [
  "40FT",
  "20FT",
  "CAR",
  "MACHINERY_VEHICLE",
  "COIL",
  "LOOSE",
  "BULK",
];

export const CARGO_TYPE_LABELS: Record<CargoType, string> = {
  "40FT": "40ft Container",
  "20FT": "20ft Container",
  CAR: "Car",
  MACHINERY_VEHICLE: "Machinery Vehicle",
  COIL: "Coil",
  LOOSE: "Loose",
  BULK: "Bulk",
};

/** Friendly label for a cargo-type code; falls back to the raw code. */
export function cargoLabel(code: string | null | undefined): string {
  if (!code) return "";
  return CARGO_TYPE_LABELS[code as CargoType] ?? code;
}

export function isCargoType(v: string): v is CargoType {
  return (CARGO_TYPES as readonly string[]).includes(v);
}
