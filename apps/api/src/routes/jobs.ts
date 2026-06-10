import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@motionconvert/db";
import {
  type ConversionSettings,
  conversionSettingsSchema,
  jobIdParamSchema,
  MAX_UPLOAD_BYTES,
  validateHtmlFilename,
} from "@motionconvert/shared";
import { resolveStoragePath, STORAGE_ROOT } from "../config.js";
import { getQueue } from "../queue.js";

export function parseSettingsField(settingsField: unknown): ConversionSettings {
  if (!settingsField || Array.isArray(settingsField)) {
    throw new Error("Missing settings field");
  }

  const raw = "value" in settingsField ? settingsField.value : settingsField;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return conversionSettingsSchema.parse(parsed);
}

function serializeJob(job: {
  id: string;
  status: string;
  originalFilename: string;
  progress: number;
  errorMessage: string | null;
  settings: unknown;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    id: job.id,
    status: job.status,
    originalFilename: job.originalFilename,
    progress: job.progress,
    errorMessage: job.errorMessage,
    settings: job.settings,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/jobs", { preHandler: app.rateLimit() }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Missing file upload" });
    }

    const filename = data.filename;
    if (!validateHtmlFilename(filename)) {
      return reply.status(400).send({ error: "File must be .html or .htm" });
    }

    const jobId = randomUUID();
    const inputRelative = join("uploads", `${jobId}.html`);
    const outputRelative = join("outputs", `${jobId}.mp4`);
    const inputAbsolute = resolveStoragePath(inputRelative);

    await mkdir(join(STORAGE_ROOT, "uploads"), { recursive: true });

    let bytesWritten = 0;
    const writeStream = createWriteStream(inputAbsolute);
    for await (const chunk of data.file) {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_UPLOAD_BYTES) {
        writeStream.destroy();
        return reply.status(413).send({ error: "File exceeds 10 MB limit" });
      }
      if (!writeStream.write(chunk)) {
        await new Promise((resolve) => writeStream.once("drain", resolve));
      }
    }
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    let settings: ConversionSettings;
    try {
      settings = parseSettingsField(data.fields.settings);
    } catch (err) {
      if (err instanceof Error && err.message === "Missing settings field") {
        return reply.status(400).send({ error: "Missing settings field" });
      }
      return reply.status(400).send({
        error: "Invalid settings",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const job = await prisma.conversionJob.create({
      data: {
        id: jobId,
        status: "pending",
        originalFilename: filename,
        inputPath: inputRelative.replace(/\\/g, "/"),
        outputPath: outputRelative.replace(/\\/g, "/"),
        settings,
      },
    });

    await getQueue().add(
      jobId,
      {
        jobId,
        inputPath: job.inputPath,
        outputPath: job.outputPath!,
        settings,
      },
      {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return reply.status(201).send(serializeJob(job));
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const params = jobIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid job ID" });
    }

    const job = await prisma.conversionJob.findUnique({
      where: { id: params.data.id },
    });

    if (!job) {
      return reply.status(404).send({ error: "Job not found" });
    }

    return serializeJob(job);
  });

  app.get("/api/jobs/:id/download", async (request, reply) => {
    const params = jobIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid job ID" });
    }

    const job = await prisma.conversionJob.findUnique({
      where: { id: params.data.id },
    });

    if (!job) {
      return reply.status(404).send({ error: "Job not found" });
    }

    if (job.status !== "completed" || !job.outputPath) {
      return reply.status(409).send({ error: "Job not completed yet" });
    }

    const outputAbsolute = resolveStoragePath(job.outputPath);
    try {
      await access(outputAbsolute);
    } catch {
      return reply.status(404).send({ error: "Output file not found" });
    }

    const downloadName = job.originalFilename.replace(/\.html?$/i, ".mp4");
    return reply
      .header("Content-Type", "video/mp4")
      .header("Content-Disposition", `attachment; filename="${downloadName}"`)
      .send(createReadStream(outputAbsolute));
  });
}
