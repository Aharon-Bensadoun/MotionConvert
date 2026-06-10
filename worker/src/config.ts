import "./env.js";
import { join } from "node:path";
import { resolveStorageRoot } from "@motionconvert/shared/paths";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const STORAGE_ROOT = resolveStorageRoot();

export function resolveStoragePath(relativePath: string): string {
  return join(STORAGE_ROOT, relativePath);
}
