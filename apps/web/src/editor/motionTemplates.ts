/**
 * Motion design template catalog.
 *
 * Each template is a self-contained, deterministic CSS animation that plays
 * well with the MotionConvert capture pipeline (CSS animations advance under
 * CDP virtual time, so they render frame-accurate to MP4).
 *
 * A template only describes *how* something animates. The per-element timing
 * (duration / delay / easing / iterations) is chosen by the user when the
 * template is applied, see `MotionAssignment`.
 */

export type MotionCategory =
  | "Entrance"
  | "Exit"
  | "Emphasis"
  | "Attention"
  | "Text"
  | "Background"
  | "Camera";

export type EasingKey =
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "linear"
  | "spring"
  | "bounce";

export const EASINGS: Record<EasingKey, string> = {
  ease: "ease",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  linear: "linear",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
};

export interface MotionTemplate {
  id: string;
  name: string;
  category: MotionCategory;
  description: string;
  /** Emoji used as a lightweight icon in the library grid. */
  icon: string;
  /**
   * CSS for the @keyframes body. `%N%` is replaced by the unique animation
   * name when the template is materialised.
   */
  keyframes: string;
  /** Default per-element timing when the template is first applied. */
  defaults: {
    durationMs: number;
    delayMs: number;
    easing: EasingKey;
    iterations: number; // 0 means "infinite"
  };
  /**
   * Styles applied to the element *before* the animation starts (e.g. an
   * entrance template hides the element so it can fade in). Kept as a CSS
   * declaration block (without braces).
   */
  initial?: string;
  /** Whether this template is meant to loop (emphasis/attention/background). */
  loops?: boolean;
}

const kf = (s: string) => s.trim();

export const MOTION_TEMPLATES: MotionTemplate[] = [
  // ---------------------------------------------------------------- Entrance
  {
    id: "fade-in",
    name: "Fade In",
    category: "Entrance",
    icon: "🌅",
    description: "Simple opacity fade from transparent to visible.",
    keyframes: kf(`@keyframes %N% { from { opacity: 0; } to { opacity: 1; } }`),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "fade-in-up",
    name: "Fade In Up",
    category: "Entrance",
    icon: "⬆️",
    description: "Rise up while fading in.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "fade-in-down",
    name: "Fade In Down",
    category: "Entrance",
    icon: "⬇️",
    description: "Drop down while fading in.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "fade-in-left",
    name: "Fade In Left",
    category: "Entrance",
    icon: "⬅️",
    description: "Slide in from the right while fading.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "fade-in-right",
    name: "Fade In Right",
    category: "Entrance",
    icon: "➡️",
    description: "Slide in from the left while fading.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: translateX(-60px); } to { opacity: 1; transform: translateX(0); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "zoom-in",
    name: "Zoom In",
    category: "Entrance",
    icon: "🔍",
    description: "Scale up from small to full size while fading in.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }`,
    ),
    defaults: { durationMs: 700, delayMs: 0, easing: "spring", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "zoom-in-bounce",
    name: "Pop In",
    category: "Entrance",
    icon: "🎈",
    description: "Overshoot pop with a springy scale.",
    keyframes: kf(
      `@keyframes %N% { 0% { opacity: 0; transform: scale(0.3); } 60% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }`,
    ),
    defaults: { durationMs: 700, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "slide-in-bottom",
    name: "Slide In Bottom",
    category: "Entrance",
    icon: "🛝",
    description: "Slide up from off-screen at the bottom.",
    keyframes: kf(
      `@keyframes %N% { from { transform: translateY(120%); } to { transform: translateY(0); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
  },
  {
    id: "flip-in-x",
    name: "Flip In X",
    category: "Entrance",
    icon: "🔄",
    description: "Rotate in around the horizontal axis.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: perspective(600px) rotateX(90deg); } to { opacity: 1; transform: perspective(600px) rotateX(0deg); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0; backface-visibility: hidden;",
  },
  {
    id: "flip-in-y",
    name: "Flip In Y",
    category: "Entrance",
    icon: "🔃",
    description: "Rotate in around the vertical axis.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: perspective(600px) rotateY(90deg); } to { opacity: 1; transform: perspective(600px) rotateY(0deg); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0; backface-visibility: hidden;",
  },
  {
    id: "rotate-in",
    name: "Rotate In",
    category: "Entrance",
    icon: "🌀",
    description: "Spin in from a tilted angle.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: rotate(-200deg) scale(0.6); } to { opacity: 1; transform: rotate(0) scale(1); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "blur-in",
    name: "Blur In",
    category: "Entrance",
    icon: "🌫️",
    description: "Sharpen from a heavy blur while fading in.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; filter: blur(18px); } to { opacity: 1; filter: blur(0); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "roll-in",
    name: "Roll In",
    category: "Entrance",
    icon: "🎳",
    description: "Roll in from the left with rotation.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 0; transform: translateX(-100%) rotate(-120deg); } to { opacity: 1; transform: translateX(0) rotate(0); } }`,
    ),
    defaults: { durationMs: 1000, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "light-speed-in",
    name: "Light Speed In",
    category: "Entrance",
    icon: "💨",
    description: "Skew in fast from the right.",
    keyframes: kf(
      `@keyframes %N% { 0% { opacity: 0; transform: translateX(100%) skewX(-30deg); } 60% { opacity: 1; transform: translateX(-20%) skewX(20deg); } 80% { transform: translateX(0) skewX(-5deg); } 100% { opacity: 1; transform: translateX(0) skewX(0); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },

  // -------------------------------------------------------------------- Exit
  {
    id: "fade-out",
    name: "Fade Out",
    category: "Exit",
    icon: "🌑",
    description: "Fade to transparent.",
    keyframes: kf(`@keyframes %N% { from { opacity: 1; } to { opacity: 0; } }`),
    defaults: { durationMs: 800, delayMs: 2000, easing: "ease-in", iterations: 1 },
  },
  {
    id: "fade-out-up",
    name: "Fade Out Up",
    category: "Exit",
    icon: "🚀",
    description: "Drift up and fade away.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-40px); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 2000, easing: "ease-in", iterations: 1 },
  },
  {
    id: "zoom-out",
    name: "Zoom Out",
    category: "Exit",
    icon: "🔭",
    description: "Shrink away while fading.",
    keyframes: kf(
      `@keyframes %N% { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.4); } }`,
    ),
    defaults: { durationMs: 700, delayMs: 2000, easing: "ease-in", iterations: 1 },
  },
  {
    id: "slide-out-top",
    name: "Slide Out Top",
    category: "Exit",
    icon: "⤴️",
    description: "Slide off-screen upward.",
    keyframes: kf(
      `@keyframes %N% { from { transform: translateY(0); } to { transform: translateY(-120%); } }`,
    ),
    defaults: { durationMs: 800, delayMs: 2000, easing: "ease-in", iterations: 1 },
  },

  // ---------------------------------------------------------------- Emphasis
  {
    id: "pulse",
    name: "Pulse",
    category: "Emphasis",
    icon: "💓",
    description: "Gentle breathing scale, loops.",
    keyframes: kf(
      `@keyframes %N% { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`,
    ),
    defaults: { durationMs: 1400, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    loops: true,
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    category: "Emphasis",
    icon: "❤️",
    description: "Double-thump heartbeat, loops.",
    keyframes: kf(
      `@keyframes %N% { 0% { transform: scale(1); } 14% { transform: scale(1.15); } 28% { transform: scale(1); } 42% { transform: scale(1.15); } 70%, 100% { transform: scale(1); } }`,
    ),
    defaults: { durationMs: 1500, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    loops: true,
  },
  {
    id: "float",
    name: "Float",
    category: "Emphasis",
    icon: "🎐",
    description: "Slow vertical hover, loops.",
    keyframes: kf(
      `@keyframes %N% { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }`,
    ),
    defaults: { durationMs: 3000, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    loops: true,
  },
  {
    id: "spin",
    name: "Spin",
    category: "Emphasis",
    icon: "🔁",
    description: "Continuous rotation, loops.",
    keyframes: kf(`@keyframes %N% { from { transform: rotate(0); } to { transform: rotate(360deg); } }`),
    defaults: { durationMs: 4000, delayMs: 0, easing: "linear", iterations: 0 },
    loops: true,
  },
  {
    id: "wobble",
    name: "Wobble",
    category: "Emphasis",
    icon: "🤪",
    description: "Playful side-to-side wobble.",
    keyframes: kf(
      `@keyframes %N% { 0% { transform: translateX(0); } 15% { transform: translateX(-25%) rotate(-5deg); } 30% { transform: translateX(20%) rotate(3deg); } 45% { transform: translateX(-15%) rotate(-3deg); } 60% { transform: translateX(10%) rotate(2deg); } 75% { transform: translateX(-5%) rotate(-1deg); } 100% { transform: translateX(0); } }`,
    ),
    defaults: { durationMs: 1200, delayMs: 0, easing: "ease-in-out", iterations: 1 },
  },
  {
    id: "swing",
    name: "Swing",
    category: "Emphasis",
    icon: "🪀",
    description: "Pendulum swing from the top.",
    keyframes: kf(
      `@keyframes %N% { 20% { transform: rotate(15deg); } 40% { transform: rotate(-10deg); } 60% { transform: rotate(5deg); } 80% { transform: rotate(-5deg); } 100% { transform: rotate(0); } }`,
    ),
    defaults: { durationMs: 1200, delayMs: 0, easing: "ease-in-out", iterations: 1 },
    initial: "transform-origin: top center;",
  },
  {
    id: "rubber-band",
    name: "Rubber Band",
    category: "Emphasis",
    icon: "🪢",
    description: "Stretch and squash like rubber.",
    keyframes: kf(
      `@keyframes %N% { 0% { transform: scale(1); } 30% { transform: scaleX(1.25) scaleY(0.75); } 40% { transform: scaleX(0.75) scaleY(1.25); } 50% { transform: scaleX(1.15) scaleY(0.85); } 65% { transform: scaleX(0.95) scaleY(1.05); } 75% { transform: scaleX(1.05) scaleY(0.95); } 100% { transform: scale(1); } }`,
    ),
    defaults: { durationMs: 1000, delayMs: 0, easing: "ease-out", iterations: 1 },
  },
  {
    id: "tada",
    name: "Tada",
    category: "Emphasis",
    icon: "🎉",
    description: "Celebration shake and scale.",
    keyframes: kf(
      `@keyframes %N% { 0% { transform: scale(1) rotate(0); } 10%, 20% { transform: scale(0.9) rotate(-3deg); } 30%, 50%, 70%, 90% { transform: scale(1.1) rotate(3deg); } 40%, 60%, 80% { transform: scale(1.1) rotate(-3deg); } 100% { transform: scale(1) rotate(0); } }`,
    ),
    defaults: { durationMs: 1200, delayMs: 0, easing: "ease-in-out", iterations: 1 },
  },

  // --------------------------------------------------------------- Attention
  {
    id: "shake-x",
    name: "Shake",
    category: "Attention",
    icon: "📳",
    description: "Quick horizontal shake.",
    keyframes: kf(
      `@keyframes %N% { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }`,
    ),
    defaults: { durationMs: 700, delayMs: 0, easing: "ease-in-out", iterations: 1 },
  },
  {
    id: "bounce",
    name: "Bounce",
    category: "Attention",
    icon: "🏀",
    description: "Bouncing ball, loops.",
    keyframes: kf(
      `@keyframes %N% { 0%, 20%, 53%, 80%, 100% { transform: translateY(0); } 40%, 43% { transform: translateY(-30px); } 70% { transform: translateY(-15px); } 90% { transform: translateY(-4px); } }`,
    ),
    defaults: { durationMs: 1400, delayMs: 0, easing: "ease-out", iterations: 0 },
    loops: true,
  },
  {
    id: "jello",
    name: "Jello",
    category: "Attention",
    icon: "🍮",
    description: "Skew jiggle like jelly.",
    keyframes: kf(
      `@keyframes %N% { 0%, 11%, 100% { transform: skewX(0) skewY(0); } 22% { transform: skewX(-12deg) skewY(-12deg); } 33% { transform: skewX(6deg) skewY(6deg); } 44% { transform: skewX(-3deg) skewY(-3deg); } 55% { transform: skewX(1.5deg) skewY(1.5deg); } }`,
    ),
    defaults: { durationMs: 1100, delayMs: 0, easing: "ease-in-out", iterations: 1 },
  },
  {
    id: "flash",
    name: "Flash",
    category: "Attention",
    icon: "⚡",
    description: "Blink visibility to grab attention.",
    keyframes: kf(
      `@keyframes %N% { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0; } }`,
    ),
    defaults: { durationMs: 1000, delayMs: 0, easing: "ease-in-out", iterations: 1 },
  },
  {
    id: "glow-pulse",
    name: "Glow Pulse",
    category: "Attention",
    icon: "🔆",
    description: "Pulsing glowing halo, loops.",
    keyframes: kf(
      `@keyframes %N% { 0%, 100% { filter: drop-shadow(0 0 2px rgba(108,92,231,0.6)); } 50% { filter: drop-shadow(0 0 18px rgba(108,92,231,0.95)); } }`,
    ),
    defaults: { durationMs: 1600, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    loops: true,
  },

  // -------------------------------------------------------------------- Text
  {
    id: "text-reveal-up",
    name: "Text Reveal",
    category: "Text",
    icon: "🔤",
    description: "Wipe the text up into view (clip).",
    keyframes: kf(
      `@keyframes %N% { from { clip-path: inset(100% 0 0 0); transform: translateY(0.4em); } to { clip-path: inset(0 0 0 0); transform: translateY(0); } }`,
    ),
    defaults: { durationMs: 900, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "clip-path: inset(100% 0 0 0);",
  },
  {
    id: "typewriter",
    name: "Typewriter",
    category: "Text",
    icon: "⌨️",
    description: "Reveal text left-to-right like typing.",
    keyframes: kf(`@keyframes %N% { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`),
    defaults: { durationMs: 1600, delayMs: 0, easing: "linear", iterations: 1 },
    initial: "clip-path: inset(0 100% 0 0); white-space: nowrap;",
  },
  {
    id: "text-focus-in",
    name: "Focus In",
    category: "Text",
    icon: "🔠",
    description: "Sharpen text from blur with letter spacing.",
    keyframes: kf(
      `@keyframes %N% { from { filter: blur(12px); opacity: 0; letter-spacing: 0.4em; } to { filter: blur(0); opacity: 1; letter-spacing: normal; } }`,
    ),
    defaults: { durationMs: 1000, delayMs: 0, easing: "ease-out", iterations: 1 },
    initial: "opacity: 0;",
  },
  {
    id: "text-shimmer",
    name: "Shimmer",
    category: "Text",
    icon: "✨",
    description: "Gradient shimmer sweeping across text, loops.",
    keyframes: kf(`@keyframes %N% { to { background-position: 200% center; } }`),
    defaults: { durationMs: 3000, delayMs: 0, easing: "linear", iterations: 0 },
    initial:
      "background: linear-gradient(90deg, currentColor 0%, currentColor 40%, #fff 50%, currentColor 60%, currentColor 100%); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;",
    loops: true,
  },

  // -------------------------------------------------------------- Background
  {
    id: "gradient-shift",
    name: "Gradient Shift",
    category: "Background",
    icon: "🎨",
    description: "Animated gradient background, loops.",
    keyframes: kf(
      `@keyframes %N% { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`,
    ),
    defaults: { durationMs: 8000, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    initial:
      "background: linear-gradient(-45deg, #6c5ce7, #00cec9, #fd79a8, #fdcb6e); background-size: 400% 400%;",
    loops: true,
  },
  {
    id: "ken-burns",
    name: "Ken Burns",
    category: "Camera",
    icon: "🎥",
    description: "Slow zoom + pan, great for image backgrounds.",
    keyframes: kf(
      `@keyframes %N% { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.18) translate(-2%, -2%); } }`,
    ),
    defaults: { durationMs: 12000, delayMs: 0, easing: "ease-out", iterations: 1 },
  },
  {
    id: "parallax-drift",
    name: "Parallax Drift",
    category: "Camera",
    icon: "🏞️",
    description: "Gentle continuous horizontal drift, loops.",
    keyframes: kf(
      `@keyframes %N% { 0% { transform: translateX(0); } 50% { transform: translateX(-3%); } 100% { transform: translateX(0); } }`,
    ),
    defaults: { durationMs: 10000, delayMs: 0, easing: "ease-in-out", iterations: 0 },
    loops: true,
  },
];

export const MOTION_CATEGORIES: MotionCategory[] = [
  "Entrance",
  "Exit",
  "Emphasis",
  "Attention",
  "Text",
  "Background",
  "Camera",
];

export function getTemplate(id: string): MotionTemplate | undefined {
  return MOTION_TEMPLATES.find((t) => t.id === id);
}
