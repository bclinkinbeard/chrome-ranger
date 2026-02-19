import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  resolveRef,
  ensureWorktree,
  safeWorktreeName,
  cleanWorktrees,
} from "../worktrees.js";

const execFileAsync = promisify(execFile);

let tmpDir: string;
let repoDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-wt-"));
  repoDir = path.join(tmpDir, "repo");

  // Create a test git repo with a few commits and branches
  await fs.mkdir(repoDir, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd: repoDir });
  await execFileAsync("git", ["config", "tag.gpgsign", "false"], { cwd: repoDir });

  await fs.writeFile(path.join(repoDir, "file.txt"), "v1");
  await execFileAsync("git", ["add", "."], { cwd: repoDir });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repoDir });

  await execFileAsync("git", ["checkout", "-b", "feature/test"], { cwd: repoDir });
  await fs.writeFile(path.join(repoDir, "file.txt"), "v2");
  await execFileAsync("git", ["add", "."], { cwd: repoDir });
  await execFileAsync("git", ["commit", "-m", "feature"], { cwd: repoDir });

  await execFileAsync("git", ["checkout", "main"], { cwd: repoDir }).catch(() =>
    execFileAsync("git", ["checkout", "master"], { cwd: repoDir }),
  );

  await execFileAsync("git", ["tag", "v1.0.0"], { cwd: repoDir });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("resolveRef", () => {
  it("returns full 40-char SHA for a valid branch", async () => {
    const sha = await resolveRef(repoDir, "feature/test");
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns full SHA for a valid tag", async () => {
    const sha = await resolveRef(repoDir, "v1.0.0");
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws for a non-existent ref", async () => {
    await expect(resolveRef(repoDir, "nonexistent")).rejects.toThrow(
      "Git ref not found: nonexistent",
    );
  });
});

describe("ensureWorktree", () => {
  it("creates a new worktree at the correct path", async () => {
    const sha = await resolveRef(repoDir, "feature/test");
    const wt = await ensureWorktree(repoDir, "feature/test", sha);

    expect(wt.ref).toBe("feature/test");
    expect(wt.sha).toBe(sha);
    expect(wt.path).toContain("feature-test");

    // Verify it's a real directory with content
    const stat = await fs.stat(wt.path);
    expect(stat.isDirectory()).toBe(true);

    // Verify it's at the correct commit
    const { stdout } = await execFileAsync("git", ["-C", wt.path, "rev-parse", "HEAD"]);
    expect(stdout.trim()).toBe(sha);
  });

  it("reuses an existing worktree", async () => {
    const sha = await resolveRef(repoDir, "feature/test");
    const wt1 = await ensureWorktree(repoDir, "feature/test", sha);
    const wt2 = await ensureWorktree(repoDir, "feature/test", sha);

    expect(wt1.path).toBe(wt2.path);
  });

  it("worktree is detached at the correct commit", async () => {
    const sha = await resolveRef(repoDir, "feature/test");
    const wt = await ensureWorktree(repoDir, "feature/test", sha);

    const { stdout } = await execFileAsync("git", ["-C", wt.path, "rev-parse", "HEAD"]);
    expect(stdout.trim()).toBe(sha);
  });
});

describe("safeWorktreeName", () => {
  it("replaces slashes with hyphens", () => {
    expect(safeWorktreeName("feature/virtual-list", [])).toBe(
      "feature-virtual-list",
    );
  });

  it("passes through simple names", () => {
    expect(safeWorktreeName("main", [])).toBe("main");
  });

  it("preserves dots", () => {
    expect(safeWorktreeName("v4.5.0", [])).toBe("v4.5.0");
  });

  it("disambiguates collisions with numeric suffix", () => {
    expect(safeWorktreeName("feature/foo", ["feature-foo"])).toBe(
      "feature-foo-2",
    );
  });
});

describe("cleanWorktrees", () => {
  it("is idempotent (no error if no worktrees exist)", async () => {
    await expect(cleanWorktrees(repoDir)).resolves.toBeUndefined();
  });

  it("removes all worktree directories", async () => {
    const sha = await resolveRef(repoDir, "feature/test");
    await ensureWorktree(repoDir, "feature/test", sha);

    await cleanWorktrees(repoDir);

    const worktreesDir = path.join(repoDir, ".chrome-ranger", "worktrees");
    await expect(fs.access(worktreesDir)).rejects.toThrow();
  });
});
