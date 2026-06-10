import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAME } from "@motionconvert/shared";
import { REDIS_URL } from "./config.js";

let queue: Queue | undefined;
let redis: IORedis | undefined;

export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  await redis?.quit();
}
