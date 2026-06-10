import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { checkPrerequisitesSync } from "@motionconvert/converter";
import { prisma } from "@motionconvert/db";
import { API_HOST, API_PORT } from "./config.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { closeQueue, getRedis } from "./queue.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
});

// Only POST /api/jobs is rate-limited; polling GET routes must stay unlimited.
await app.register(rateLimit, {
  global: false,
  max: 10,
  timeWindow: "1 hour",
});

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

app.get("/api/health", async () => {
  let dbOk = false;
  let redisOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    const pong = await getRedis().ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  const prereqs = checkPrerequisitesSync();
  const healthy = dbOk && redisOk;
  return {
    status: healthy ? "ok" : "degraded",
    db: dbOk,
    redis: redisOk,
    converter: {
      ffmpeg: prereqs.ffmpeg,
      chromium: prereqs.chromium,
      ready: prereqs.errors.length === 0,
      errors: prereqs.errors,
    },
  };
});

await registerJobRoutes(app);

const shutdown = async () => {
  await closeQueue();
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ host: API_HOST, port: API_PORT });
  console.log(`API listening on http://${API_HOST}:${API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
