/** Parse a CSS time value like "30s", "1.5s", or "500ms" into milliseconds. */
export function parseDurationFromCssVar(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d.]+)(m?s)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num < 0) return null;

  return match[2] === "ms" ? num : num * 1000;
}

/** Detect native duration (seconds) from raw HTML text. */
export function detectDurationFromHtml(html: string): number | null {
  const cssMatch = html.match(/--duration:\s*([\d.]+)(ms|s)\s*;/);
  if (cssMatch) {
    const ms = parseDurationFromCssVar(cssMatch[1] + cssMatch[2]);
    if (ms) return Math.round(ms / 1000);
  }

  if (html.includes("const CFG=") || html.includes("const DUR=")) {
    const durValues = [...html.matchAll(/dur:\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
    const explicitSum = durValues.reduce((a, b) => a + b, 0);
    const tickCount = (html.match(/tick:\s*\d+/g) || []).length;
    const writeCount = (html.match(/write:\s*1/g) || []).length;
    const initDelay = html.includes("INIT_DELAY") ? 450 : 0;
    const estimatedMs = initDelay + explicitSum + tickCount * 3500 + writeCount * 3000;
    return Math.ceil(estimatedMs / 1000);
  }

  return null;
}

export function durationMismatchPercent(manual: number, detected: number): number {
  if (detected <= 0) return 0;
  return Math.abs(manual - detected) / detected;
}
