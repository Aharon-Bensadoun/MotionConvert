import { describe, expect, it } from "vitest";
import {
  computeProgress,
  computeTotalFrames,
  conversionSettingsSchema,
  resolveDimensions,
} from "./schemas.js";

describe("conversionSettingsSchema", () => {
  it("accepts valid settings", () => {
    const result = conversionSettingsSchema.parse({
      preset: "9:16",
      fps: 30,
      durationSec: 30,
      format: "mp4",
    });
    expect(result.preset).toBe("9:16");
    expect(result.autoDuration).toBe(true);
  });

  it("defaults autoDuration to true", () => {
    const result = conversionSettingsSchema.parse({
      preset: "16:9",
      fps: 30,
      durationSec: 30,
    });
    expect(result.autoDuration).toBe(true);
  });

  it("rejects invalid fps", () => {
    expect(() =>
      conversionSettingsSchema.parse({
        preset: "16:9",
        fps: 25,
        durationSec: 10,
      }),
    ).toThrow();
  });
});

describe("resolveDimensions", () => {
  it("returns preset dimensions", () => {
    const dims = resolveDimensions({
      preset: "9:16",
      fps: 30,
      durationSec: 10,
      autoDuration: true,
      format: "mp4",
    });
    expect(dims).toEqual({ width: 1080, height: 1920 });
  });
});

describe("frame helpers", () => {
  it("computes total frames", () => {
    expect(computeTotalFrames(30, 30)).toBe(900);
  });

  it("computes progress", () => {
    expect(computeProgress(450, 900)).toBe(50);
  });
});
