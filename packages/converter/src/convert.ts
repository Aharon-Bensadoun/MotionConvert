import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  installVirtualTime,
  probeTimelineDuration,
  pumpVirtualTimeUntil,
  resolveDurationSec,
  VIRTUAL_TIME_BROWSER_ARGS,
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
  /* MotionConvert export overrides — hide player chrome, never touch timing */
  body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
  .controls, .hud, .toolbar, .debug, .tip, .replay,
  [data-export-hide="true"] { display: none !important; }
`;

const FRAME_FORMAT = (process.env.FRAME_FORMAT ?? "jpeg").toLowerCase() as "jpeg" | "png";
const FRAME_QUALITY = Number(process.env.FRAME_QUALITY ?? "90");

async function injectExportStyles(page: Page): Promise<void> {
  await page.addStyleTag({ content: EXPORT_CSS });
}

async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  // The page clock is frozen here: fonts load over real network, but never
  // block on anything timer-driven — cap the wait harness-side.
  await Promise.race([
    page
      .evaluate(async () => {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      })
      .catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
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
    // Deterministic rendering mode: frames are produced exclusively through
    // CDP beginFrames stamped with the virtual clock. BeginFrame control is
    // officially supported in the Chromium headless shell (installed alongside
    // chromium by `playwright install chromium`).
    browser = await chromium.launch({
      headless: true,
      channel: "chromium-headless-shell",
      args: VIRTUAL_TIME_BROWSER_ARGS,
    });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      // Some fixtures collapse animation durations under reduced motion.
      reducedMotion: "no-preference",
    });

    // Freeze the page clock BEFORE navigation: timers, rAF and CSS animations
    // then only advance when we grant virtual time, one frame at a time.
    const virtualTime = await installVirtualTime(page);

    // Navigation/parsing only progress when virtual time advances: pump small
    // budgets until the DOM is ready. `pumpedMs` becomes the clock origin.
    const { pumpedMs } = await pumpVirtualTimeUntil(
      virtualTime,
      page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 60_000 }),
    );
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

    // Frame N is captured at virtual time origin + N*1000/fps. Integer-ms
    // targets with delta ticks keep cumulative drift below 1ms.
    let clockMs = pumpedMs;
    let previousFrame: Buffer | null = null;
    for (let frame = 0; frame < totalFrames; frame++) {
      const targetMs = pumpedMs + Math.round((frame * 1000) / settings.fps);
      if (targetMs > clockMs) {
        await virtualTime.tick(targetMs - clockMs);
        clockMs = targetMs;
      }

      // beginFrame may return no data while the renderer initializes; retry,
      // then fall back to the previous (unchanged) frame.
      let image = await virtualTime.captureScreenshot(FRAME_FORMAT, FRAME_QUALITY);
      for (let attempt = 0; !image && attempt < 3 && !previousFrame; attempt++) {
        image = await virtualTime.captureScreenshot(FRAME_FORMAT, FRAME_QUALITY);
      }
      if (!image) image = previousFrame;
      if (!image) {
        throw new Error(`Failed to capture frame ${frame}: renderer produced no image`);
      }
      previousFrame = image;

      const framePath = join(framesDir, `frame_${String(frame).padStart(6, "0")}.${ext}`);
      await writeFile(framePath, image);

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
