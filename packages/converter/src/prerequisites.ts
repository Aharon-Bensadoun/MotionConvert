import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export interface PrerequisitesResult {
  ffmpeg: boolean;
  chromium: boolean;
  ffmpegPath?: string;
  errors: string[];
}

export function checkFfmpeg(): { ok: boolean; path?: string; error?: string } {
  const result = spawnSync("ffmpeg", ["-version"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  if (result.status === 0) {
    return { ok: true, path: "ffmpeg" };
  }
  return {
    ok: false,
    error: "FFmpeg not found on PATH. Install FFmpeg and add it to your PATH.",
  };
}

export function checkChromium(): { ok: boolean; error?: string } {
  try {
    const executable = chromium.executablePath();
    if (!existsSync(executable)) {
      return {
        ok: false,
        error: "Playwright Chromium not installed. Run: pnpm playwright:install",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Playwright not available. Run: pnpm playwright:install",
    };
  }
}

export function checkPrerequisitesSync(): PrerequisitesResult {
  const errors: string[] = [];
  const ffmpegCheck = checkFfmpeg();
  if (!ffmpegCheck.ok && ffmpegCheck.error) {
    errors.push(ffmpegCheck.error);
  }

  const chromiumCheck = checkChromium();
  if (!chromiumCheck.ok && chromiumCheck.error) {
    errors.push(chromiumCheck.error);
  }

  return {
    ffmpeg: ffmpegCheck.ok,
    chromium: chromiumCheck.ok,
    ffmpegPath: ffmpegCheck.path,
    errors,
  };
}
