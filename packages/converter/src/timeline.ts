import type { Page } from "playwright";
import { parseDurationFromCssVar, detectDurationFromHtml } from "@motionconvert/shared";

export { parseDurationFromCssVar, detectDurationFromHtml };

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

export async function prepareExport(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        __MOTIONCONVERT__?: { prepareExport?: () => void };
      }
    ).__MOTIONCONVERT__;
    api?.prepareExport?.();
  });
}

export async function seekToTime(page: Page, timeMs: number): Promise<void> {
  await page.evaluate((t) => {
    const api = (
      window as unknown as {
        __MOTIONCONVERT__?: { seek?: (ms: number) => void };
      }
    ).__MOTIONCONVERT__;

    if (typeof api?.seek === "function") {
      api.seek(t);
      return;
    }

    document.getAnimations().forEach((anim) => {
      anim.pause();
      anim.currentTime = t;
    });
  }, timeMs);

  // Let seek-driven style/DOM updates paint before screenshot.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
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
