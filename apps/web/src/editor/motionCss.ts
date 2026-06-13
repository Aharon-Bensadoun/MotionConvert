/**
 * Turns motion assignments into deterministic CSS that the MotionConvert
 * pipeline can capture frame-accurately, and injects it into an HTML document.
 */
import { EASINGS, getTemplate, type EasingKey } from "./motionTemplates";

/** A single motion applied to a single element (identified by data-mc-id). */
export interface MotionAssignment {
  /** Unique key for this assignment (an element may have several). */
  key: string;
  /** Stable id stamped on the target element as data-mc-id. */
  mcId: string;
  /** Template id from the catalog. */
  templateId: string;
  /** Optional slide grouping (organisational only). */
  slideId?: string | null;
  /** Human label for the element (tag + snippet), shown in the UI. */
  label: string;
  durationMs: number;
  delayMs: number;
  easing: EasingKey;
  /** 0 = infinite. */
  iterations: number;
}

export const MC_STYLE_ID = "mc-motion-styles";
export const MC_DATA_ATTR = "data-mc-id";

function animationName(a: MotionAssignment): string {
  return `mc_${a.templateId.replace(/-/g, "_")}_${a.key.replace(/[^a-zA-Z0-9_]/g, "")}`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Build the full CSS block (keyframes + per-element rules). Multiple
 * assignments on the same element are merged into a single comma-separated
 * `animation` declaration so they all play together.
 */
export function buildMotionCss(assignments: MotionAssignment[]): string {
  const keyframeBlocks: string[] = [];
  const byElement = new Map<string, MotionAssignment[]>();

  for (const a of assignments) {
    if (!getTemplate(a.templateId)) continue;
    const list = byElement.get(a.mcId) ?? [];
    list.push(a);
    byElement.set(a.mcId, list);
  }

  const ruleBlocks: string[] = [];
  for (const [mcId, list] of byElement) {
    const animations: string[] = [];
    const initials: string[] = [];
    for (const a of list) {
      const tpl = getTemplate(a.templateId)!;
      const name = animationName(a);
      keyframeBlocks.push(tpl.keyframes.replace(/%N%/g, name));
      const easing = EASINGS[a.easing] ?? a.easing;
      const iterations = a.iterations === 0 ? "infinite" : String(a.iterations);
      animations.push(`${name} ${a.durationMs}ms ${easing} ${a.delayMs}ms ${iterations} both`);
      if (tpl.initial) initials.push(tpl.initial);
    }
    const selector = `[${MC_DATA_ATTR}="${escapeAttr(mcId)}"]`;
    const decls = [...new Set(initials)];
    decls.push(`animation: ${animations.join(", ")};`);
    ruleBlocks.push(`${selector} { ${decls.join(" ")} }`);
  }

  return [...keyframeBlocks, ...ruleBlocks].join("\n");
}

/**
 * Inject (or replace) the generated motion stylesheet into an HTML document
 * string. The data-mc-id attributes are expected to already be present on the
 * elements (stamped during editing). Returns the new HTML string.
 */
export function injectMotionStyles(html: string, assignments: MotionAssignment[]): string {
  const css = buildMotionCss(assignments);
  const styleTag = `<style id="${MC_STYLE_ID}">\n${css}\n</style>`;

  const existing = new RegExp(`<style id="${MC_STYLE_ID}">[\\s\\S]*?</style>`, "i");
  if (existing.test(html)) {
    return html.replace(existing, styleTag);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}\n</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1\n${styleTag}`);
  }
  return `${styleTag}\n${html}`;
}
