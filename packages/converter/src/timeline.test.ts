import { describe, expect, it, vi } from "vitest";
import {
  detectDurationFromHtml,
  parseDurationFromCssVar,
  resolveDurationSec,
  seekToTime,
} from "./timeline.js";

describe("parseDurationFromCssVar", () => {
  it("parses seconds", () => {
    expect(parseDurationFromCssVar("30s")).toBe(30000);
    expect(parseDurationFromCssVar("1.5s")).toBe(1500);
  });

  it("parses milliseconds", () => {
    expect(parseDurationFromCssVar("500ms")).toBe(500);
  });

  it("returns null for invalid values", () => {
    expect(parseDurationFromCssVar("")).toBeNull();
    expect(parseDurationFromCssVar("abc")).toBeNull();
  });
});

describe("detectDurationFromHtml", () => {
  it("detects EvaMedical --duration", () => {
    const html = ":root { --duration: 30s; }";
    expect(detectDurationFromHtml(html)).toBe(30);
  });

  it("detects Judayka CFG heuristic", () => {
    const html = "const CFG=[{tick:640},{dur:7600},{write:1,dur:4400}]; const DUR=CFG.map(...);";
    const detected = detectDurationFromHtml(html);
    expect(detected).not.toBeNull();
    expect(detected!).toBeGreaterThan(10);
  });
});

describe("resolveDurationSec", () => {
  it("uses detected duration when autoDuration is true", () => {
    const result = resolveDurationSec(30, true, { durationMs: 45000, source: "export-api" });
    expect(result.durationSec).toBe(45);
    expect(result.warning).toBeUndefined();
  });

  it("caps manual duration above detected timeline", () => {
    const result = resolveDurationSec(49, false, { durationMs: 42000, source: "export-api" });
    expect(result.durationSec).toBe(42);
    expect(result.warning).toContain("capped");
  });

  it("warns on manual mismatch over 5% when below detected", () => {
    const result = resolveDurationSec(30, false, { durationMs: 50000, source: "export-api" });
    expect(result.durationSec).toBe(30);
    expect(result.warning).toContain("differs");
  });

  it("uses manual duration when within 5%", () => {
    const result = resolveDurationSec(29, false, { durationMs: 30000, source: "css-var" });
    expect(result.durationSec).toBe(29);
    expect(result.warning).toBeUndefined();
  });
});

describe("seekToTime", () => {
  it("passes timeMs to page.evaluate and waits for paint", async () => {
    const page = {
      evaluate: vi.fn(async (fn: unknown, t?: number) => {
        if (typeof t === "number") return;
        const prev = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
          cb(0);
          return 0;
        };
        try {
          await (fn as () => Promise<void>)();
        } finally {
          globalThis.requestAnimationFrame = prev;
        }
      }),
    };

    await seekToTime(page as never, 1500);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 1500);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });
});
