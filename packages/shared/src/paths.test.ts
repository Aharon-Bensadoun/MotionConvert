import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot, resolveStorageRoot } from "./paths.js";

describe("paths", () => {
  it("finds monorepo root", () => {
    const root = getRepoRoot();
    expect(existsSync(join(root, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("resolves storage from repo root", () => {
    process.env.STORAGE_ROOT = "storage";
    const root = resolveStorageRoot();
    expect(root.endsWith("storage")).toBe(true);
    expect(root).not.toContain("apps\\api");
  });
});
