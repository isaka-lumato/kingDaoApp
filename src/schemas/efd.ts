import { z } from "zod";

const HHMM_OR_HHMMSS = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export const efdRecordSchema = z.object({
  efd_code: z
    .string()
    .trim()
    .min(1, "EFD code is required")
    .max(40, "EFD code must be 40 characters or fewer"),
  efd_time: z
    .string()
    .trim()
    .regex(HHMM_OR_HHMMSS, "Time must be HH:MM or HH:MM:SS")
    .optional()
    .or(z.literal("")),
  is_private: z.coerce.boolean().optional(),
  is_transit: z.coerce.boolean().optional(),
  is_shared: z.coerce.boolean().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type EfdRecordInput = z.infer<typeof efdRecordSchema>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const consignmentIdSchema = z.string().regex(UUID_RE, "Invalid consignment id");

export function normaliseFlagsFromCode(code: string, raw: {
  is_private?: boolean;
  is_transit?: boolean;
}): { is_private: boolean; is_transit: boolean } {
  const upper = code.trim().toUpperCase();
  return {
    is_private: upper === "PRIVATE" ? true : Boolean(raw.is_private),
    is_transit: upper === "TRANSIT" ? true : Boolean(raw.is_transit),
  };
}
