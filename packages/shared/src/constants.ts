export const ASPECT_PRESETS = {
  "9:16": { width: 1080, height: 1920, label: "9:16 (Vertical)" },
  "16:9": { width: 1920, height: 1080, label: "16:9 (Horizontal)" },
  "1:1": { width: 1080, height: 1080, label: "1:1 (Square)" },
} as const;

export type AspectPresetKey = keyof typeof ASPECT_PRESETS;

export const JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DURATION_SEC = 120;
export const MAX_DIMENSION = 1920;
export const ALLOWED_FPS = [24, 30, 60] as const;

export const QUEUE_NAME = "conversion-jobs";
