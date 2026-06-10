import { describe, expect, it } from "vitest";
import {
  detectDurationFromHtml,
  durationMismatchPercent,
  parseDurationFromCssVar,
} from "./duration.js";

describe("parseDurationFromCssVar", () => {
  it("parses 30s to 30000ms", () => {
    expect(parseDurationFromCssVar("30s")).toBe(30000);
  });
});

describe("detectDurationFromHtml", () => {
  it("returns 30 for EvaMedical-style HTML", () => {
    expect(detectDurationFromHtml("--duration: 30s;")).toBe(30);
  });
});

describe("durationMismatchPercent", () => {
  it("returns 0 when values match", () => {
    expect(durationMismatchPercent(30, 30)).toBe(0);
  });

  it("detects 40% mismatch", () => {
    expect(durationMismatchPercent(30, 50)).toBeCloseTo(0.4);
  });
});
