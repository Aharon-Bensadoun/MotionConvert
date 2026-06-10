-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "conversion_jobs" (
    "id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "original_filename" TEXT NOT NULL,
    "input_path" TEXT NOT NULL,
    "output_path" TEXT,
    "settings" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "conversion_jobs_pkey" PRIMARY KEY ("id")
);
