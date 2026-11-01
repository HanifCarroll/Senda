import { z } from "zod";
import { SourceInput } from "../core/schema.js";
export const UUID = z.uuid();
export const ModelKind = z.enum(["as-is", "to-be"]);
export const Plan = z.strictObject({
  baselineRevision: z.number().int().positive(),
  brief: z.string().trim().min(1).max(50000),
});
export const Create = z.strictObject({
  name: z.string().trim().max(160).optional(),
  purpose: z.string().trim().max(2000).optional(),
  perspective: z.string().trim().max(2000).optional(),
  source: SourceInput.optional(),
}).refine(data => (data.name && data.purpose && data.perspective) || data.source?.text.trim(), {
  path: ['source'], message: 'Add a transcript to get started. Everything else is optional.',
}).transform(data => ({
  ...data,
  name: data.name || 'Untitled process',
  purpose: data.purpose || 'No purpose added yet',
  perspective: data.perspective || 'No perspective added yet',
}));
