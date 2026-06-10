import type { CDPSession, Page } from "playwright";
import { parseDurationFromCssVar, detectDurationFromHtml } from "@motionconvert/shared";

export { parseDurationFromCssVar, detectDurationFromHtml };

/**
 * Controls Chromium's virtual time via CDP (`Emulation.setVirtualTimePolicy`
 * + `HeadlessExperimental.beginFrame`), mirroring Chromium's own
 * headless/test virtual-time-controller helper.
 *
 * Once installed (before navigation), the page's clock is frozen: timers,
 * requestAnimationFrame, CSS animations/transitions and the Web Animations API
 * only advance when `tick()` grants a time budget. Rendering is driven by
 * explicit beginFrames stamped with the virtual clock, so screenshots always
 * reflect the exact virtual time — fully deterministic captures.
 *
 * Requires Chromium launched with `--enable-begin-frame-control` and
 * `--run-all-compositor-stages-before-draw` (headless shell only).
 */
export interface VirtualTimeController {
  /** Advance the page clock by exactly `budgetMs` virtual milliseconds. */
  tick(budgetMs: number): Promise<void>;
  /** Render a frame at the current virtual time and return the encoded image. */
  captureScreenshot(format: "png" | "jpeg", quality?: number): Promise<Buffer | null>;
  detach(): Promise<void>;
}

/** Internal rendering cadence: 60Hz, like Chromium's reference controller. */
const ANIMATION_FRAME_INTERVAL_MS = 16;

/** Wall-clock safety net per granted chunk — a healthy chunk takes a few ms. */
const TICK_WATCHDOG_MS = 30_000;

export const VIRTUAL_TIME_BROWSER_ARGS = [
  "--deterministic-mode",
  "--enable-begin-frame-control",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-checker-imaging",
];

/**
 * Must be called BEFORE `page.goto()` so the page scripts never see real time.
 * Virtual time starts paused; page load and network are unaffected (only the
 * clock and delayed tasks freeze).
 */
export async function installVirtualTime(page: Page): Promise<VirtualTimeController> {
  const client: CDPSession = await page.context().newCDPSession(page);
  const { virtualTimeTicksBase } = await client.send("Emulation.setVirtualTimePolicy", {
    policy: "pause",
  });

  // frameTimeTicks must be monotonic across beginFrames; base is nudged after
  // each screenshot (Chromium reference controller does the same).
  let base = virtualTimeTicksBase;
  let elapsedMs = 0;

  // The renderer wants the very first frame to be fully updated.
  await client.send("HeadlessExperimental.beginFrame", {
    frameTimeTicks: base,
    noDisplayUpdates: false,
  });

  function grantChunk(budgetMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onExpired = () => {
        clearTimeout(watchdog);
        resolve();
      };
      const watchdog = setTimeout(() => {
        client.off("Emulation.virtualTimeBudgetExpired", onExpired);
        reject(
          new Error(
            `Virtual time stalled: ${budgetMs}ms budget not consumed within ${TICK_WATCHDOG_MS}ms (pending network request or runaway task loop in the page)`,
          ),
        );
      }, TICK_WATCHDOG_MS);

      client.once("Emulation.virtualTimeBudgetExpired", onExpired);
      client
        .send("Emulation.setVirtualTimePolicy", {
          policy: "pauseIfNetworkFetchesPending",
          budget: budgetMs,
          // Prevent rAF/timer loops from starving virtual time advancement.
          maxVirtualTimeTaskStarvationCount: 5_000,
        })
        .catch((err) => {
          clearTimeout(watchdog);
          client.off("Emulation.virtualTimeBudgetExpired", onExpired);
          reject(err);
        });
    });
  }

  return {
    async tick(budgetMs: number): Promise<void> {
      // Advance in chunks aligned to the 60Hz rendering cadence, issuing an
      // animation frame at each boundary so rAF and animations progress.
      let remaining = budgetMs;
      while (remaining > 0) {
        const toBoundary =
          ANIMATION_FRAME_INTERVAL_MS - (elapsedMs % ANIMATION_FRAME_INTERVAL_MS);
        const chunk = Math.min(toBoundary, remaining);
        await grantChunk(chunk);
        elapsedMs += chunk;
        remaining -= chunk;

        if (remaining > 0 && elapsedMs % ANIMATION_FRAME_INTERVAL_MS === 0) {
          await client.send("HeadlessExperimental.beginFrame", {
            frameTimeTicks: base + elapsedMs,
            noDisplayUpdates: true,
          });
        }
      }
    },
    async captureScreenshot(format: "png" | "jpeg", quality?: number): Promise<Buffer | null> {
      const { screenshotData } = await client.send("HeadlessExperimental.beginFrame", {
        frameTimeTicks: base + elapsedMs,
        screenshot: format === "jpeg" ? { format, quality } : { format },
      });
      // Keep subsequent beginFrame timestamps strictly increasing.
      base += 0.01;
      if (!screenshotData) return null;
      return Buffer.from(screenshotData, "base64");
    },
    async detach(): Promise<void> {
      await client.detach().catch(() => {});
    },
  };
}

export interface TimelineInfo {
  durationMs: number;
  source: "css-var" | "js-eval" | "export-api" | "fallback";
}

export async function probeTimelineDuration(
  page: Page,
  fallbackSec: number,
): Promise<TimelineInfo> {
  const result = await page.evaluate(() => {
    const api = (
      window as unknown as {
        __MOTIONCONVERT__?: { getDurationMs?: () => number };
      }
    ).__MOTIONCONVERT__;

    if (typeof api?.getDurationMs === "function") {
      const ms = api.getDurationMs();
      if (typeof ms === "number" && ms > 0) {
        return { durationMs: ms, source: "export-api" as const };
      }
    }

    const cssVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--duration")
      .trim();
    if (cssVar) {
      const match = cssVar.match(/^([\d.]+)(m?s)$/);
      if (match) {
        const num = parseFloat(match[1]);
        const ms = match[2] === "ms" ? num : num * 1000;
        if (ms > 0) return { durationMs: ms, source: "css-var" as const };
      }
    }

    try {
      const fn = new Function(`
        if (typeof DUR !== 'undefined' && Array.isArray(DUR)) {
          const init = typeof INIT_DELAY !== 'undefined' ? INIT_DELAY : 450;
          return init + DUR.reduce((a, b) => a + b, 0);
        }
        return 0;
      `);
      const ms = fn() as number;
      if (typeof ms === "number" && ms > 0) {
        return { durationMs: ms, source: "js-eval" as const };
      }
    } catch {
      // ignore eval errors
    }

    return null;
  });

  if (result) return result;

  return {
    durationMs: fallbackSec * 1000,
    source: "fallback",
  };
}

/**
 * Chromium needs virtual time to advance for navigation/parsing to complete.
 * Grants small budgets until `promise` settles, and reports how much virtual
 * time the page consumed before being ready (the capture clock origin).
 */
export async function pumpVirtualTimeUntil<T>(
  virtualTime: VirtualTimeController,
  promise: Promise<T>,
  stepMs = 16,
): Promise<{ value: T; pumpedMs: number }> {
  let done = false;
  let failed = false;
  let value: T | undefined;
  let error: unknown;
  promise.then(
    (v) => {
      value = v;
      done = true;
    },
    (e) => {
      error = e;
      failed = true;
      done = true;
    },
  );

  let pumpedMs = 0;
  await new Promise((resolve) => setImmediate(resolve));
  while (!done) {
    await virtualTime.tick(stepMs);
    pumpedMs += stepMs;
    // Yield a macrotask so the awaited promise's continuations can settle.
    await new Promise((resolve) => setImmediate(resolve));
  }

  if (failed) throw error;
  return { value: value as T, pumpedMs };
}

export function resolveDurationSec(
  settingsDurationSec: number,
  autoDuration: boolean,
  probed: TimelineInfo,
): { durationSec: number; warning?: string } {
  if (probed.source !== "fallback") {
    const detectedSec = probed.durationMs / 1000;

    if (autoDuration) {
      return { durationSec: detectedSec };
    }

    if (settingsDurationSec > detectedSec) {
      return {
        durationSec: detectedSec,
        warning: `Duration capped from ${settingsDurationSec}s to detected ${detectedSec.toFixed(1)}s to avoid a frozen final scene`,
      };
    }

    const diff = Math.abs(detectedSec - settingsDurationSec) / detectedSec;
    if (diff > 0.05) {
      return {
        durationSec: settingsDurationSec,
        warning: `Manual duration ${settingsDurationSec}s differs from detected ${detectedSec.toFixed(1)}s by ${(diff * 100).toFixed(0)}%`,
      };
    }
  }

  return { durationSec: settingsDurationSec };
}
