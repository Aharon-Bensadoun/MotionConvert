import type { AspectPresetKey } from "@motionconvert/shared";

export interface JobResponse {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  originalFilename: string;
  progress: number;
  errorMessage: string | null;
  settings: {
    preset: AspectPresetKey;
    fps: number;
    durationSec: number;
    autoDuration?: boolean;
    format: string;
  };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateJobSettings {
  preset: AspectPresetKey;
  fps: number;
  durationSec: number;
  autoDuration?: boolean;
  format: "mp4";
}

export async function createJob(file: File, settings: CreateJobSettings): Promise<JobResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("settings", JSON.stringify(settings));

  const res = await fetch("/api/jobs", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to create job");
  }
  return res.json();
}

export interface HealthResponse {
  status: string;
  db: boolean;
  redis: boolean;
  converter: {
    ffmpeg: boolean;
    chromium: boolean;
    ready: boolean;
    errors: string[];
  };
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error("API health check failed");
  }
  return res.json();
}

export async function getJob(id: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      throw new Error(
        retryAfter
          ? `Too many requests — retry in ${retryAfter}s`
          : "Too many requests — slowing down polling",
      );
    }
    throw new Error(err.error ?? "Failed to fetch job");
  }
  return res.json();
}

export function getDownloadUrl(id: string): string {
  return `/api/jobs/${id}/download`;
}
