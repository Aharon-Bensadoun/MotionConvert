import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@motionconvert/db";
import { QUEUE_NAME } from "@motionconvert/shared";

const RECOVER_MESSAGE =
  "Conversion interrupted (worker restarted). Please submit the job again.";

export async function recoverOrphanedActiveJobs(redisUrl: string): Promise<number> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });

  try {
    const activeJobs = await queue.getJobs(["active"], 0, 100);
    if (activeJobs.length === 0) {
      return 0;
    }

    for (const job of activeJobs) {
      const jobId = job.data?.jobId ?? job.id;
      console.warn(`[worker] Recovering orphaned active job ${jobId}`);

      try {
        await job.moveToFailed(new Error(RECOVER_MESSAGE), "0", true);
      } catch (err) {
        console.warn(`[worker] Could not move job ${jobId} to failed:`, err);
      }

      await prisma.conversionJob.updateMany({
        where: { id: jobId, status: { in: ["pending", "processing"] } },
        data: {
          status: "failed",
          errorMessage: RECOVER_MESSAGE,
          completedAt: new Date(),
        },
      });
    }

    return activeJobs.length;
  } finally {
    await queue.close();
    await connection.quit();
  }
}
