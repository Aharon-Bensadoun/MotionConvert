import { describe, expect, it } from "vitest";
import {
  conversionSettingsSchema,
  jobIdParamSchema,
  validateHtmlFilename,
} from "@motionconvert/shared";

describe("API validation helpers", () => {
  it("validates job id param", () => {
    const result = jobIdParamSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid job id", () => {
    const result = jobIdParamSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("validates html filename", () => {
    expect(validateHtmlFilename("motion.html")).toBe(true);
    expect(validateHtmlFilename("motion.txt")).toBe(false);
  });

  it("parses conversion settings", () => {
    const settings = conversionSettingsSchema.parse({
      preset: "9:16",
      fps: 30,
      durationSec: 30,
    });
    expect(settings.format).toBe("mp4");
  });
});
