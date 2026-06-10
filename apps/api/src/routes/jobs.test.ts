import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  conversionSettingsSchema,
  jobIdParamSchema,
  validateHtmlFilename,
} from "@motionconvert/shared";
import { parseSettingsField } from "./jobs.js";

describe("parseSettingsField", () => {
  it("parses settings from multipart field value", () => {
    const settings = parseSettingsField({
      value: JSON.stringify({
        preset: "9:16",
        fps: 30,
        durationSec: 20,
        format: "mp4",
      }),
    });
    expect(settings.preset).toBe("9:16");
    expect(settings.durationSec).toBe(20);
  });

  it("throws when settings field is missing", () => {
    expect(() => parseSettingsField(undefined)).toThrow("Missing settings field");
  });
});

function buildMultipartBody(
  parts: Array<
    | { kind: "field"; name: string; value: string }
    | { kind: "file"; name: string; filename: string; content: string }
  >,
): { body: string; contentType: string } {
  const boundary = "----motionconvert-test-boundary";
  const chunks: string[] = [];

  for (const part of parts) {
    chunks.push(`--${boundary}\r\n`);
    if (part.kind === "file") {
      chunks.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`,
      );
      chunks.push("Content-Type: text/html\r\n\r\n");
      chunks.push(`${part.content}\r\n`);
      continue;
    }

    chunks.push(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`);
    chunks.push(`${part.value}\r\n`);
  }

  chunks.push(`--${boundary}--\r\n`);
  return {
    body: chunks.join(""),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("multipart field order", () => {
  it("reads settings after file when settings is sent second", async () => {
    const app = Fastify();
    await app.register(multipart);

    app.post("/test", async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "Missing file upload" });
      }

      for await (const _chunk of data.file) {
        // Consume the upload stream so later fields become available.
      }

      try {
        const settings = parseSettingsField(data.fields.settings);
        return reply.status(200).send({ preset: settings.preset });
      } catch (err) {
        if (err instanceof Error && err.message === "Missing settings field") {
          return reply.status(400).send({ error: "Missing settings field" });
        }
        throw err;
      }
    });

    const { body, contentType } = buildMultipartBody([
      { kind: "file", name: "file", filename: "motion.html", content: "<html></html>" },
      {
        kind: "field",
        name: "settings",
        value: JSON.stringify({
          preset: "9:16",
          fps: 30,
          durationSec: 20,
          format: "mp4",
        }),
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/test",
      payload: body,
      headers: { "content-type": contentType },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ preset: "9:16" });
    await app.close();
  });
});

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
