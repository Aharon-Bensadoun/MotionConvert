import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Always resolves storage under the monorepo root, never the process cwd. */
export function resolveStorageRoot(): string {
  const envRoot = process.env.STORAGE_ROOT?.trim();
  if (!envRoot) {
    return join(getRepoRoot(), "storage");
  }
  if (/^([a-zA-Z]:\\|\\\\|\/)/.test(envRoot)) {
    return resolve(envRoot);
  }
  const relative = envRoot.replace(/^\.\//, "");
  return join(getRepoRoot(), relative);
}
