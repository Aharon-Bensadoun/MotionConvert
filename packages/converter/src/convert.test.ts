import { describe, expect, it } from "vitest";
import { computeTotalFrames } from "@motionconvert/shared";

describe("computeTotalFrames", () => {
  it("calculates frames for 30s at 30fps", () => {
    expect(computeTotalFrames(30, 30)).toBe(900);
  });

  it("calculates frames for partial seconds", () => {
    expect(computeTotalFrames(1.5, 30)).toBe(45);
  });
});
