import "./env.js";
import { join } from "node:path";
import { resolveStorageRoot } from "@motionconvert/shared/paths";

export const API_HOST = process.env.API_HOST ?? "127.0.0.1";
export const API_PORT = Number(process.env.API_PORT ?? 3001);
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const STORAGE_ROOT = resolveStorageRoot();

export function resolveStoragePath(relativePath: string): string {
  return join(STORAGE_ROOT, relativePath);
}
