import { z } from "zod";
import {
  ALLOWED_FPS,
  ASPECT_PRESETS,
  MAX_DIMENSION,
  MAX_DURATION_SEC,
  MAX_UPLOAD_BYTES,
} from "./constants.js";

export const aspectPresetSchema = z.enum(["9:16", "16:9", "1:1"]);

export const conversionSettingsSchema = z.object({
  preset: aspectPresetSchema,
  fps: z
    .number()
    .int()
    .refine((v) => ALLOWED_FPS.includes(v as (typeof ALLOWED_FPS)[number]), {
      message: `FPS must be one of: ${ALLOWED_FPS.join(", ")}`,
    }),
  durationSec: z.number().min(1).max(MAX_DURATION_SEC),
  autoDuration: z.boolean().default(true),
  format: z.literal("mp4").default("mp4"),
});

export type ConversionSettings = z.infer<typeof conversionSettingsSchema>;

export const createJobBodySchema = z.object({
  settings: conversionSettingsSchema,
});

export const jobIdParamSchema = z.object({
  id: z.string().uuid(),
});

export function resolveDimensions(settings: ConversionSettings): {
  width: number;
  height: number;
} {
  const preset = ASPECT_PRESETS[settings.preset];
  if (preset.width > MAX_DIMENSION || preset.height > MAX_DIMENSION) {
    throw new Error("Resolution exceeds maximum allowed dimensions");
  }
  return { width: preset.width, height: preset.height };
}

export function validateHtmlFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".html") || filename.toLowerCase().endsWith(".htm");
}

export { MAX_UPLOAD_BYTES };

export function computeTotalFrames(durationSec: number, fps: number): number {
  return Math.ceil(durationSec * fps);
}

export function computeProgress(capturedFrames: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  return Math.min(100, Math.round((capturedFrames / totalFrames) * 100));
}
