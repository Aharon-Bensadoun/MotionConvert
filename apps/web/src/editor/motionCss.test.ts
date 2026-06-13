import { describe, expect, it } from "vitest";
import { buildMotionCss, injectMotionStyles, MC_STYLE_ID, type MotionAssignment } from "./motionCss";

function make(overrides: Partial<MotionAssignment>): MotionAssignment {
  return {
    key: "k1",
    mcId: "el1",
    templateId: "fade-in",
    label: "h1",
    durationMs: 800,
    delayMs: 0,
    easing: "ease-out",
    iterations: 1,
    ...overrides,
  };
}

describe("buildMotionCss", () => {
  it("emits keyframes and a selector rule for an assignment", () => {
    const css = buildMotionCss([make({})]);
    expect(css).toContain("@keyframes");
    expect(css).toContain('[data-mc-id="el1"]');
    expect(css).toContain("800ms");
    expect(css).toContain("ease-out");
  });

  it("maps iterations of 0 to infinite", () => {
    const css = buildMotionCss([make({ templateId: "pulse", iterations: 0 })]);
    expect(css).toContain("infinite");
  });

  it("maps named easings like spring to a cubic-bezier", () => {
    const css = buildMotionCss([make({ easing: "spring" })]);
    expect(css).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });

  it("merges multiple motions on one element into a single animation list", () => {
    const css = buildMotionCss([
      make({ key: "k1", templateId: "fade-in" }),
      make({ key: "k2", templateId: "pulse", iterations: 0 }),
    ]);
    const ruleMatches = css.match(/\[data-mc-id="el1"\] \{/g) ?? [];
    expect(ruleMatches).toHaveLength(1);
    // The combined animation declaration references both keyframe names.
    expect(css).toMatch(/animation: mc_fade_in_k1[^;]*, mc_pulse_k2/);
  });

  it("ignores unknown template ids", () => {
    const css = buildMotionCss([make({ templateId: "does-not-exist" })]);
    expect(css).toBe("");
  });
});

describe("injectMotionStyles", () => {
  it("inserts the style block before </head>", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    const out = injectMotionStyles(html, [make({})]);
    expect(out).toContain(`<style id="${MC_STYLE_ID}">`);
    expect(out.indexOf(`id="${MC_STYLE_ID}"`)).toBeLessThan(out.indexOf("</head>"));
  });

  it("replaces an existing block instead of duplicating (idempotent re-export)", () => {
    const html = "<html><head></head><body></body></html>";
    const once = injectMotionStyles(html, [make({})]);
    const twice = injectMotionStyles(once, [make({ durationMs: 1234 })]);
    const count = (twice.match(new RegExp(`id="${MC_STYLE_ID}"`, "g")) ?? []).length;
    expect(count).toBe(1);
    expect(twice).toContain("1234ms");
  });

  it("falls back to after <body> when there is no head", () => {
    const html = "<body><h1>hi</h1></body>";
    const out = injectMotionStyles(html, [make({})]);
    expect(out).toContain(`<style id="${MC_STYLE_ID}">`);
  });
});
