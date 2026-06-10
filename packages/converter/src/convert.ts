import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  computeProgress,
  computeTotalFrames,
  type ConversionSettings,
  resolveDimensions,
} from "@motionconvert/shared";
import { serveHtmlFile } from "./server.js";
import {
  prepareExport,
  probeTimelineDuration,
  resolveDurationSec,
  seekToTime,
} from "./timeline.js";

export interface CaptureOptions {
  htmlPath: string;
  settings: ConversionSettings;
  framesDir: string;
  onProgress?: (progress: number) => void | Promise<void>;
}

export interface CaptureResult {
  totalFrames: number;
  framesDir: string;
  width: number;
  height: number;
  durationSec: number;
}

const EXPORT_CSS = `
  /* MotionConvert export overrides */
  body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
  .controls, .hud, .toolbar, .debug, [data-export-hide="true"] { display: none !important; }

  /* Stop infinite animation loops during export */
  *, *::before, *::after {
    animation-iteration-count: 1 !important;
    animation-fill-mode: forwards !important;
  }

  /* Override prefers-reduced-motion (EvaMedical sets animations to 0.001s) */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: unset !important;
      animation-iteration-count: 1 !important;
      transition-duration: unset !important;
    }
  }
`;

const FRAME_FORMAT = (process.env.FRAME_FORMAT ?? "jpeg").toLowerCase() as "jpeg" | "png";
const FRAME_QUALITY = Number(process.env.FRAME_QUALITY ?? "90");

async function injectExportStyles(page: Page): Promise<void> {
  await page.addStyleTag({ content: EXPORT_CSS });
  await page.evaluate(() => {
    document.querySelectorAll(".controls, .hud, .toolbar, .debug").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
  });
}

async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(200);
}

function frameExtension(): string {
  return FRAME_FORMAT === "jpeg" ? "jpg" : "png";
}

export async function captureFrames(options: CaptureOptions): Promise<CaptureResult> {
  const { htmlPath, settings, framesDir, onProgress } = options;
  const { width, height } = resolveDimensions(settings);
  const ext = frameExtension();

  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const server = await serveHtmlFile(htmlPath);
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForPageReady(page);
    await injectExportStyles(page);

    const probed = await probeTimelineDuration(page, settings.durationSec);
    const { durationSec, warning } = resolveDurationSec(
      settings.durationSec,
      settings.autoDuration ?? true,
      probed,
    );

    if (warning) {
      console.warn(`[capture] ${warning}`);
    }
    if (probed.source !== "fallback") {
      console.log(
        `[capture] Duration ${durationSec.toFixed(2)}s (source: ${probed.source}, auto: ${settings.autoDuration ?? true})`,
      );
    }

    const totalFrames = computeTotalFrames(durationSec, settings.fps);

    await prepareExport(page);

    for (let frame = 0; frame < totalFrames; frame++) {
      const timeMs = (frame / settings.fps) * 1000;
      await seekToTime(page, timeMs);

      const framePath = join(framesDir, `frame_${String(frame).padStart(6, "0")}.${ext}`);
      if (FRAME_FORMAT === "jpeg") {
        await page.screenshot({ path: framePath, type: "jpeg", quality: FRAME_QUALITY });
      } else {
        await page.screenshot({ path: framePath, type: "png" });
      }

      if (onProgress) {
        await onProgress(computeProgress(frame + 1, totalFrames));
      }
    }

    return { totalFrames, framesDir, width, height, durationSec };
  } finally {
    await browser?.close();
    await server.close();
  }
}

export interface EncodeOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  width: number;
  height: number;
  frameExt?: string;
}

export async function encodeVideo(options: EncodeOptions): Promise<void> {
  const { framesDir, outputPath, fps, width, height, frameExt = frameExtension() } = options;
  const inputPattern = join(framesDir, `frame_%06d.${frameExt}`);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-threads",
      "0",
      "-framerate",
      String(fps),
      "-i",
      inputPattern,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale=${width}:${height}`,
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
    });

    proc.on("error", (err) => reject(err));
  });
}

export interface ConvertOptions {
  htmlPath: string;
  outputPath: string;
  settings: ConversionSettings;
  workDir: string;
  onProgress?: (progress: number) => void | Promise<void>;
}

export async function convertHtmlToMp4(options: ConvertOptions): Promise<void> {
  const { htmlPath, outputPath, settings, workDir, onProgress } = options;
  const framesDir = join(workDir, "frames");

  const captureResult = await captureFrames({
    htmlPath,
    settings,
    framesDir,
    onProgress: async (captureProgress) => {
      if (onProgress) await onProgress(Math.round(captureProgress * 0.9));
    },
  });

  await encodeVideo({
    framesDir: captureResult.framesDir,
    outputPath,
    fps: settings.fps,
    width: captureResult.width,
    height: captureResult.height,
  });

  if (onProgress) await onProgress(100);

  await rm(framesDir, { recursive: true, force: true });
}
