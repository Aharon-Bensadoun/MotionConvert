import { describe, expect, it, vi } from "vitest";
import {
  detectDurationFromHtml,
  installVirtualTime,
  parseDurationFromCssVar,
  resolveDurationSec,
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

describe("installVirtualTime", () => {
  interface SentCommand {
    method: string;
    params?: Record<string, unknown>;
  }

  function createFakeCdp() {
    const listeners = new Map<string, (event: unknown) => void>();
    const sent: SentCommand[] = [];

    const client = {
      send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        sent.push({ method, params });
        if (method === "Emulation.setVirtualTimePolicy") {
          if (params?.budget !== undefined) {
            queueMicrotask(() => listeners.get("Emulation.virtualTimeBudgetExpired")?.({}));
            return {};
          }
          return { virtualTimeTicksBase: 1000 };
        }
        if (method === "HeadlessExperimental.beginFrame") {
          return { hasDamage: true, screenshotData: Buffer.from("img").toString("base64") };
        }
        return {};
      }),
      once: vi.fn((event: string, cb: (e: unknown) => void) => {
        listeners.set(event, cb);
      }),
      off: vi.fn((event: string) => {
        listeners.delete(event);
      }),
      detach: vi.fn(async () => {}),
    };

    const page = {
      context: () => ({ newCDPSession: async () => client }),
    };

    return { client, page, sent };
  }

  it("pauses virtual time then issues an initial beginFrame", async () => {
    const { page, sent } = createFakeCdp();

    await installVirtualTime(page as never);

    expect(sent).toEqual([
      { method: "Emulation.setVirtualTimePolicy", params: { policy: "pause" } },
      {
        method: "HeadlessExperimental.beginFrame",
        params: { frameTimeTicks: 1000, noDisplayUpdates: false },
      },
    ]);
  });

  it("advances in 16ms chunks with animation beginFrames at boundaries", async () => {
    const { page, sent } = createFakeCdp();

    const vt = await installVirtualTime(page as never);
    await vt.tick(33);

    const afterInstall = sent.slice(2);
    expect(afterInstall.map((c) => ({ m: c.method, p: c.params }))).toEqual([
      // chunk to first 16ms boundary
      {
        m: "Emulation.setVirtualTimePolicy",
        p: expect.objectContaining({ policy: "pauseIfNetworkFetchesPending", budget: 16 }),
      },
      {
        m: "HeadlessExperimental.beginFrame",
        p: { frameTimeTicks: 1016, noDisplayUpdates: true },
      },
      { m: "Emulation.setVirtualTimePolicy", p: expect.objectContaining({ budget: 16 }) },
      {
        m: "HeadlessExperimental.beginFrame",
        p: { frameTimeTicks: 1032, noDisplayUpdates: true },
      },
      // remainder of the 33ms budget
      { m: "Emulation.setVirtualTimePolicy", p: expect.objectContaining({ budget: 1 }) },
    ]);
  });

  it("captures a screenshot stamped at the current virtual time", async () => {
    const { page, sent } = createFakeCdp();

    const vt = await installVirtualTime(page as never);
    await vt.tick(33);
    const image = await vt.captureScreenshot("jpeg", 90);

    expect(image).toEqual(Buffer.from("img"));
    const capture = sent[sent.length - 1];
    expect(capture).toEqual({
      method: "HeadlessExperimental.beginFrame",
      params: { frameTimeTicks: 1033, screenshot: { format: "jpeg", quality: 90 } },
    });
  });

  it("keeps beginFrame timestamps strictly increasing across screenshots", async () => {
    const { page, sent } = createFakeCdp();

    const vt = await installVirtualTime(page as never);
    await vt.captureScreenshot("png");
    await vt.captureScreenshot("png");

    const captures = sent.filter(
      (c) => c.method === "HeadlessExperimental.beginFrame" && c.params?.screenshot,
    );
    const [first, second] = captures.map((c) => c.params!.frameTimeTicks as number);
    expect(second).toBeGreaterThan(first);
  });

  it("rejects when the CDP command fails", async () => {
    const { client, page } = createFakeCdp();
    const vt = await installVirtualTime(page as never);

    client.send.mockRejectedValueOnce(new Error("Target closed"));

    await expect(vt.tick(16)).rejects.toThrow("Target closed");
  });
});
