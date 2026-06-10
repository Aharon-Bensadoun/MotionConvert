import { useEffect, useState } from "react";
import type { JobResponse } from "./api";
import { getJob } from "./api";

const POLL_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const STUCK_PENDING_MS = 15000;

export function useJobPolling(jobId: string | null) {
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stuckPending, setStuckPending] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setError(null);
      setStuckPending(false);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let backoffMs = POLL_INTERVAL_MS;
    let pendingSince: number | null = null;

    const schedule = (delay: number) => {
      timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const data = await getJob(jobId);
        if (!active) return;

        setJob(data);
        setError(null);
        backoffMs = POLL_INTERVAL_MS;

        if (data.status === "pending" && !data.startedAt) {
          if (pendingSince === null) {
            pendingSince = Date.now();
          }
          setStuckPending(Date.now() - pendingSince >= STUCK_PENDING_MS);
        } else {
          pendingSince = null;
          setStuckPending(false);
        }

        if (data.status === "pending" || data.status === "processing") {
          schedule(POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        schedule(backoffMs);
      }
    };

    pendingSince = Date.now();
    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  return { job, error, stuckPending };
}
