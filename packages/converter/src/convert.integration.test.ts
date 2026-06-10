import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { checkPrerequisitesSync, convertHtmlToMp4, getRepoRoot } from "./index.js";

const repoRoot = getRepoRoot();
const fixturesDir = join(repoRoot, "html_Motion_examples");

const hasPrerequisites = () => {
  const check = checkPrerequisitesSync();
  return check.ffmpeg && check.chromium;
};

async function getVideoDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { shell: process.platform === "win32" },
    );

    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffprobe failed (code ${code})`));
      else resolve(parseFloat(stdout.trim()));
    });

    proc.on("error", reject);
  });
}

/** Average luma (YAVG) of every frame, via ffprobe signalstats. */
async function getFrameLumas(workDir: string, fileName: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `movie=${fileName},signalstats`,
        "-show_entries",
        "frame_tags=lavfi.signalstats.YAVG",
        "-of",
        "csv=p=0",
      ],
      // Relative movie= filename avoids Windows drive-colon escaping in lavfi.
      { shell: process.platform === "win32", cwd: workDir },
    );

    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffprobe signalstats failed (code ${code})`));
      else {
        resolve(
          stdout
            .trim()
            .split(/\r?\n/)
            .map((line) => parseFloat(line)),
        );
      }
    });

    proc.on("error", reject);
  });
}

describe.skipIf(!hasPrerequisites())("integration: timing fidelity", () => {
  it("fires a JS timer at the right virtual time (flip at 950ms)", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "motionconvert-timing-"));
    const htmlPath = join(workDir, "flip.html");
    const outputPath = join(workDir, "output.mp4");

    await writeFile(
      htmlPath,
      `<!doctype html>
<html><head><style>html,body{margin:0;background:#000}</style></head>
<body><script>setTimeout(function(){document.body.style.background='#fff';},950);</script></body></html>`,
      "utf8",
    );

    try {
      await convertHtmlToMp4({
        htmlPath,
        outputPath,
        settings: {
          preset: "1:1",
          fps: 10,
          durationSec: 2,
          autoDuration: false,
          format: "mp4",
        },
        workDir,
      });

      const lumas = await getFrameLumas(workDir, "output.mp4");
      expect(lumas).toHaveLength(20);

      // Frames 0-9 cover t=0..900ms (black); frames 10-19 cover t>=1000ms (white).
      const before = lumas.slice(0, 10);
      const after = lumas.slice(10);
      expect(Math.max(...before)).toBeLessThan(50);
      expect(Math.min(...after)).toBeGreaterThan(200);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.skipIf(!hasPrerequisites())("integration: HTML to MP4", () => {
  it("converts EvaMedical HTML at full 30s duration (16:9, 30fps)", async () => {
    const htmlPath = join(fixturesDir, "evamedical_motion_design_pub_adaptatif_v3.html");
    expect(existsSync(htmlPath)).toBe(true);

    const workDir = await mkdtemp(join(tmpdir(), "motionconvert-evamedical-"));
    const outputPath = join(workDir, "output.mp4");

    try {
      const start = Date.now();
      await convertHtmlToMp4({
        htmlPath,
        outputPath,
        settings: {
          preset: "16:9",
          fps: 30,
          durationSec: 30,
          autoDuration: true,
          format: "mp4",
        },
        workDir,
      });
      const elapsed = Date.now() - start;

      const stats = await stat(outputPath);
      expect(stats.size).toBeGreaterThan(10_000);

      const duration = await getVideoDurationSec(outputPath);
      expect(duration).toBeGreaterThan(28);
      expect(duration).toBeLessThan(32);

      // Seek-based capture should be much faster than real-time
      expect(elapsed).toBeLessThan(120_000);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 300_000);

  it("converts Judayka HTML with auto-detected duration (9:16, 30fps)", async () => {
    const htmlPath = join(fixturesDir, "judayka_spot_mobile_clean_9x16_text_fixed.html");
    expect(existsSync(htmlPath)).toBe(true);

    const workDir = await mkdtemp(join(tmpdir(), "motionconvert-judayka-"));
    const outputPath = join(workDir, "output.mp4");

    try {
      await convertHtmlToMp4({
        htmlPath,
        outputPath,
        settings: {
          preset: "9:16",
          fps: 30,
          durationSec: 30,
          autoDuration: true,
          format: "mp4",
        },
        workDir,
      });

      const stats = await stat(outputPath);
      expect(stats.size).toBeGreaterThan(10_000);

      const duration = await getVideoDurationSec(outputPath);
      // Judayka native duration is ~45-60s depending on text layout
      expect(duration).toBeGreaterThan(35);
      expect(duration).toBeLessThan(90);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 300_000);

  it("converts EvaMedical HTML (3s sample at 16:9)", async () => {
    const htmlPath = join(fixturesDir, "evamedical_motion_design_pub_adaptatif_v3.html");
    expect(existsSync(htmlPath)).toBe(true);

    const workDir = await mkdtemp(join(tmpdir(), "motionconvert-test-"));
    const outputPath = join(workDir, "output.mp4");

    try {
      await convertHtmlToMp4({
        htmlPath,
        outputPath,
        settings: {
          preset: "16:9",
          fps: 24,
          durationSec: 3,
          autoDuration: false,
          format: "mp4",
        },
        workDir,
      });

      const stats = await stat(outputPath);
      expect(stats.size).toBeGreaterThan(1000);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("converts Judayka HTML (3s sample at 9:16)", async () => {
    const htmlPath = join(fixturesDir, "judayka_spot_mobile_clean_9x16_text_fixed.html");
    expect(existsSync(htmlPath)).toBe(true);

    const workDir = await mkdtemp(join(tmpdir(), "motionconvert-test-"));
    const outputPath = join(workDir, "output.mp4");

    try {
      await convertHtmlToMp4({
        htmlPath,
        outputPath,
        settings: {
          preset: "9:16",
          fps: 24,
          durationSec: 3,
          autoDuration: false,
          format: "mp4",
        },
        workDir,
      });

      const stats = await stat(outputPath);
      expect(stats.size).toBeGreaterThan(1000);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("fixtures exist", () => {
  it("has EvaMedical fixture", () => {
    expect(existsSync(join(fixturesDir, "evamedical_motion_design_pub_adaptatif_v3.html"))).toBe(
      true,
    );
  });

  it("has Judayka fixture", () => {
    expect(existsSync(join(fixturesDir, "judayka_spot_mobile_clean_9x16_text_fixed.html"))).toBe(
      true,
    );
  });
});
