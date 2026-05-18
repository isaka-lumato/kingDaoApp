import { z } from "zod";

/**
 * Reusable zod fragments. Domain schemas (consignment, efd, etc.) compose
 * these — keeps the field-level rules in one place.
 */

export const refNoSchema = z
  .string()
  .regex(/^\d{1,7}$/, "REF No must be up to 7 digits")
  .transform((s) => s.padStart(7, "9"));

export const tansadNoSchema = z
  .string()
  .regex(/^\d{7}$/, "TANSAD No must be 7 digits")
  .optional();

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
