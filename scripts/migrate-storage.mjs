import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const rootStorage = join(repoRoot, "storage");
const legacyDirs = [
  join(repoRoot, "apps", "api", "storage"),
  join(repoRoot, "worker", "storage"),
];

for (const sub of ["uploads", "outputs", "work"]) {
  await mkdir(join(rootStorage, sub), { recursive: true });
}

for (const legacy of legacyDirs) {
  if (!existsSync(legacy)) continue;
  for (const sub of ["uploads", "outputs", "work"]) {
    const from = join(legacy, sub);
    if (!existsSync(from)) continue;
    const files = await readdir(from);
    for (const file of files) {
      const src = join(from, file);
      const dest = join(rootStorage, sub, file);
      if (!existsSync(dest)) {
        await cp(src, dest, { recursive: true });
        console.log(`Migrated ${src} -> ${dest}`);
      }
    }
  }
}
