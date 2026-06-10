import "./env.js";
import { recoverOrphanedActiveJobs } from "./recover.js";
import { REDIS_URL } from "./config.js";

const recovered = await recoverOrphanedActiveJobs(REDIS_URL);
console.log(`Recovered ${recovered} orphaned active job(s).`);
