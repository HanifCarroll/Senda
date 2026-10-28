import { z } from "zod";
import { SourceInput } from "../src/schema.js";
export const UUID = z.uuid();
export const ModelKind = z.enum(["as-is", "to-be"]);
export const Plan = z.strictObject({
  baselineRevision: z.number().int().positive(),
  brief: z.string().trim().min(1).max(50000),
});
export const Create = z.strictObject({
  name: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(2000),
  perspective: z.string().trim().min(1).max(2000),
  source: SourceInput.optional(),
});
