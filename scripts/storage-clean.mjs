import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? join(process.cwd(), "storage");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function cleanDir(dir: string): Promise<number> {
  let removed = 0;
  try {
    const files = await readdir(dir);
    const now = Date.now();
    for (const file of files) {
      if (file === ".gitkeep") continue;
      const filePath = join(dir, file);
      const info = await stat(filePath);
      if (now - info.mtimeMs > MAX_AGE_MS) {
        await unlink(filePath);
        removed++;
      }
    }
  } catch {
    // directory may not exist yet
  }
  return removed;
}

const uploads = await cleanDir(join(STORAGE_ROOT, "uploads"));
const outputs = await cleanDir(join(STORAGE_ROOT, "outputs"));
console.log(`Removed ${uploads + outputs} file(s) older than 7 days from storage/`);
