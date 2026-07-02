import { z } from "zod";

/**
 * Reusable zod fragments. Domain schemas (consignment, efd, etc.) compose
 * these — keeps the field-level rules in one place.
 */

// Ref No is a 7-digit internal job identifier, e.g. 9900001 (PRD §8.20,
// D-028, D-063). App-created rows are 99-prefixed. The regex is exported so
// the form's input `pattern` and the server zod check share one source.
export const REF_NO_PATTERN = "\\d{7}";
export const REF_NO_REGEX = /^\d{7}$/;

export const refNoSchema = z
  .string()
  .trim()
  .regex(REF_NO_REGEX, "REF No must be exactly 7 digits (e.g. 9900001)");

/** Build a 99-prefixed 7-digit ref_no from a 1-based serial (D-028/D-063). */
export function makeRefNo(serial: number): string {
  return `99${String(serial).padStart(5, "0")}`;
}

// TANSAD No fixed format TZDL-YY-####### (D-063), e.g. TZDL-26-0000000.
// Shared between the input `pattern` hint and server validation.
export const TANSAD_PATTERN = "TZDL-\\d{2}-\\d{7}";
export const TANSAD_REGEX = /^TZDL-\d{2}-\d{7}$/;

export const tansadNoSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(TANSAD_REGEX, "TANSAD No must look like TZDL-26-0000000")
  );

export const blNumberSchema = z
  .string()
  .min(1, "B/L Number is required")
  .max(64);

export const yearSchema = z
  .number()
  .int()
  .min(2024)
  .max(2030);

export const amountTzsSchema = z
  .bigint()
  .min(0n, "Amount cannot be negative");
