export { convertHtmlToMp4, captureFrames, encodeVideo } from "./convert.js";
export type { ConvertOptions, CaptureOptions, EncodeOptions } from "./convert.js";
export {
  parseDurationFromCssVar,
  detectDurationFromHtml,
  probeTimelineDuration,
  installVirtualTime,
  resolveDurationSec,
} from "./timeline.js";
export type { TimelineInfo, VirtualTimeController } from "./timeline.js";
export { serveHtmlFile, getRepoRoot } from "./server.js";
export { checkPrerequisitesSync, checkFfmpeg, checkChromium } from "./prerequisites.js";
