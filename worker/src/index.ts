import "./env.js";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { convertHtmlToMp4, checkPrerequisitesSync } from "@motionconvert/converter";
import { prisma } from "@motionconvert/db";
import { MAX_DURATION_SEC, QUEUE_NAME, type ConversionSettings } from "@motionconvert/shared";
import { REDIS_URL, resolveStoragePath, STORAGE_ROOT } from "./config.js";
import { recoverOrphanedActiveJobs } from "./recover.js";

export interface ConversionJobData {
  jobId: string;
  inputPath: string;
  outputPath: string;
  settings: ConversionSettings;
}

const WORKER_CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? "1"));

function createProgressThrottler(
  jobId: string,
  job: Job<ConversionJobData>,
  durationSec: number,
) {
  let lastReported = -1;
  let lastReportTime = 0;
  const intervalMs = 500;
  const stepPercent = 5;

  return async (progress: number) => {
    const now = Date.now();
    const isComplete = progress >= 100;
    const stepChanged = Math.floor(progress / stepPercent) > Math.floor(lastReported / stepPercent);
    const intervalElapsed = now - lastReportTime >= intervalMs;

    if (!isComplete && !stepChanged && !intervalElapsed) return;

    lastReported = progress;
    lastReportTime = now;

    await prisma.conversionJob.update({
      where: { id: jobId },
      data: { progress },
    });
    await job.updateProgress(progress);
  };
}

function computeLockDuration(durationSec: number): number {
  return durationSec * 2000 + 60_000;
}

async function processJob(job: Job<ConversionJobData>): Promise<void> {
  const { jobId, inputPath, outputPath, settings } = job.data;
  const absoluteInput = resolveStoragePath(inputPath);
  const absoluteOutput = resolveStoragePath(outputPath);
  const workDir = join(STORAGE_ROOT, "work", jobId);

  const prereqs = checkPrerequisitesSync();
  if (prereqs.errors.length > 0) {
    const message = prereqs.errors.join(" ");
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    throw new Error(message);
  }

  await prisma.conversionJob.update({
    where: { id: jobId },
    data: { status: "processing", startedAt: new Date(), progress: 0 },
  });

  await mkdir(workDir, { recursive: true });
  await mkdir(join(STORAGE_ROOT, "outputs"), { recursive: true });

  const onProgress = createProgressThrottler(jobId, job, settings.durationSec);

  try {
    await convertHtmlToMp4({
      htmlPath: absoluteInput,
      outputPath: absoluteOutput,
      settings,
      workDir,
      onProgress,
    });

    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
        outputPath,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export function startWorker(): Worker<ConversionJobData> {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<ConversionJobData>(QUEUE_NAME, processJob, {
    connection,
    concurrency: WORKER_CONCURRENCY,
    lockDuration: computeLockDuration(MAX_DURATION_SEC),
    stalledInterval: 10_000,
    maxStalledCount: 2,
  });

  worker.on("active", (job) => {
    const durationSec = job.data.settings.durationSec;
    const lockDuration = computeLockDuration(durationSec);
    if (lockDuration > worker.opts.lockDuration!) {
      worker.opts.lockDuration = lockDuration;
    }
    console.log(`[worker] Job ${job.id} started (lockDuration: ${lockDuration}ms)`);
  });

  worker.on("progress", (job, progress) => {
    console.log(`[worker] Job ${job.id} progress: ${progress}%`);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[worker] Error:", err);
  });

  return worker;
}

async function main(): Promise<void> {
  const prereqs = checkPrerequisitesSync();
  if (prereqs.errors.length > 0) {
    console.warn("[worker] Missing prerequisites — queued jobs will fail until resolved:");
    prereqs.errors.forEach((e) => console.warn(`  - ${e}`));
  } else {
    console.log("[worker] Prerequisites OK (FFmpeg + Chromium)");
  }

  const recovered = await recoverOrphanedActiveJobs(REDIS_URL);
  if (recovered > 0) {
    console.warn(`[worker] Recovered ${recovered} orphaned active job(s)`);
  }

  console.log("[worker] Starting BullMQ consumer...");
  console.log(`[worker] Storage root: ${STORAGE_ROOT}`);
  console.log(`[worker] Concurrency: ${WORKER_CONCURRENCY}`);
  startWorker();
  console.log(`[worker] Listening on queue: ${QUEUE_NAME}`);
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
