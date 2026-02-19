import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  refToDirName,
  resolveRef,
  ensureWorktree,
  cleanWorktrees,
} from "../src/worktree.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

describe("Worktree", () => {
  describe("refToDirName", () => {
    it("keeps simple names unchanged", () => {
      expect(refToDirName("main")).toBe("main");
    });

    it("replaces slashes with hyphens", () => {
      expect(refToDirName("feature/virtual-list")).toBe(
        "feature-virtual-list"
      );
    });

    it("handles dots and hyphens", () => {
      expect(refToDirName("v4.5.0")).toBe("v4.5.0");
      expect(refToDirName("release-candidate")).toBe("release-candidate");
    });

    it("handles multiple slashes", () => {
      expect(refToDirName("a/b/c")).toBe("a-b-c");
    });
  });

  describe("resolveRef", () => {
    let repoDir: string;

    beforeEach(() => {
      repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-repo-"));
      execSync("git init", { cwd: repoDir });
      execSync("git config user.email test@test.com", { cwd: repoDir });
      execSync("git config user.name Test", { cwd: repoDir });
      execSync("git config commit.gpgsign false", { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, "file.txt"), "hello");
      execSync("git add . && git commit -m 'initial'", { cwd: repoDir });
    });

    afterEach(() => {
      fs.rmSync(repoDir, { recursive: true, force: true });
    });

    it("resolves HEAD to a SHA", async () => {
      const sha = await resolveRef(repoDir, "HEAD");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("resolves branch name to a SHA", async () => {
      const branch = execSync("git branch --show-current", { cwd: repoDir })
        .toString()
        .trim();
      const sha = await resolveRef(repoDir, branch);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("resolves tag to a SHA", async () => {
      execSync("git tag v1.0.0", { cwd: repoDir });
      const sha = await resolveRef(repoDir, "v1.0.0");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("throws on invalid ref", async () => {
      await expect(resolveRef(repoDir, "nonexistent-ref")).rejects.toThrow();
    });
  });

  describe("ensureWorktree", () => {
    let repoDir: string;
    let wtDir: string;
    let sha: string;

    beforeEach(() => {
      repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-repo-"));
      wtDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-wt-"));
      execSync("git init", { cwd: repoDir });
      execSync("git config user.email test@test.com", { cwd: repoDir });
      execSync("git config user.name Test", { cwd: repoDir });
      execSync("git config commit.gpgsign false", { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, "file.txt"), "hello");
      execSync("git add . && git commit -m 'initial'", { cwd: repoDir });
      sha = execSync("git rev-parse HEAD", { cwd: repoDir })
        .toString()
        .trim();
    });

    afterEach(() => {
      // Clean up worktrees before removing dirs
      try {
        execSync("git worktree prune", { cwd: repoDir });
      } catch {
        // ignore
      }
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(wtDir, { recursive: true, force: true });
    });

    it("creates a worktree at the specified path", async () => {
      const worktreePath = path.join(wtDir, "main");
      const result = await ensureWorktree(repoDir, "HEAD", sha, worktreePath);
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.existsSync(path.join(result, "file.txt"))).toBe(true);
    });

    it("worktree is at the correct commit", async () => {
      const worktreePath = path.join(wtDir, "main");
      const result = await ensureWorktree(repoDir, "HEAD", sha, worktreePath);
      const wtSha = execSync("git rev-parse HEAD", { cwd: result })
        .toString()
        .trim();
      expect(wtSha).toBe(sha);
    });

    it("reuses existing worktree on second call", async () => {
      const worktreePath = path.join(wtDir, "main");
      await ensureWorktree(repoDir, "HEAD", sha, worktreePath);
      // Should not throw
      const result = await ensureWorktree(repoDir, "HEAD", sha, worktreePath);
      expect(fs.existsSync(result)).toBe(true);
    });
  });

  describe("cleanWorktrees", () => {
    let repoDir: string;
    let baseDir: string;
    let sha: string;

    beforeEach(() => {
      repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-repo-"));
      baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-base-"));
      execSync("git init", { cwd: repoDir });
      execSync("git config user.email test@test.com", { cwd: repoDir });
      execSync("git config user.name Test", { cwd: repoDir });
      execSync("git config commit.gpgsign false", { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, "file.txt"), "hello");
      execSync("git add . && git commit -m 'initial'", { cwd: repoDir });
      sha = execSync("git rev-parse HEAD", { cwd: repoDir })
        .toString()
        .trim();
    });

    afterEach(() => {
      try {
        execSync("git worktree prune", { cwd: repoDir });
      } catch {
        // ignore
      }
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(baseDir, { recursive: true, force: true });
    });

    it("removes worktree directories and prunes git", async () => {
      const worktreePath = path.join(baseDir, "main");
      await ensureWorktree(repoDir, "HEAD", sha, worktreePath);
      expect(fs.existsSync(worktreePath)).toBe(true);

      await cleanWorktrees(baseDir, repoDir);
      expect(fs.existsSync(worktreePath)).toBe(false);
    });
  });
});
