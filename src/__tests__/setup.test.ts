import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { realpathSync } from "node:fs";
import { Writable } from "node:stream";
import { runSetups, isSetupDone, markSetupDone } from "../setup.js";
import type { Worktree } from "../types.js";

let tmpDir: string;
let stderrOutput: string;
let mockStderr: Writable;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-setup-"));
  stderrOutput = "";
  mockStderr = new Writable({
    write(chunk, _encoding, callback) {
      stderrOutput += chunk.toString();
      callback();
    },
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("isSetupDone / markSetupDone", () => {
  it("returns false when no marker exists", async () => {
    expect(await isSetupDone(tmpDir, "abc123")).toBe(false);
  });

  it("returns true after marking done", async () => {
    await markSetupDone(tmpDir, "abc123");
    expect(await isSetupDone(tmpDir, "abc123")).toBe(true);
  });

  it("returns false when SHA differs", async () => {
    await markSetupDone(tmpDir, "abc123");
    expect(await isSetupDone(tmpDir, "def456")).toBe(false);
  });
});

describe("runSetups", () => {
  it("runs setup command with cwd set to worktree directory", async () => {
    const wt: Worktree = { ref: "main", sha: "a".repeat(40), path: tmpDir };
    const results = await runSetups("echo done", [wt], mockStderr);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("successful setup writes marker file", async () => {
    const sha = "b".repeat(40);
    const wt: Worktree = { ref: "main", sha, path: tmpDir };
    await runSetups("echo done", [wt], mockStderr);

    expect(await isSetupDone(tmpDir, sha)).toBe(true);
  });

  it("setup skipped when marker file matches current SHA", async () => {
    const sha = "c".repeat(40);
    const wt: Worktree = { ref: "main", sha, path: tmpDir };
    await markSetupDone(tmpDir, sha);

    const results = await runSetups("echo done", [wt], mockStderr);
    expect(results[0].success).toBe(true);
    expect(stderrOutput).toContain("cached");
  });

  it("setup re-runs when marker file has different SHA", async () => {
    await markSetupDone(tmpDir, "old-sha");
    const sha = "d".repeat(40);
    const wt: Worktree = { ref: "main", sha, path: tmpDir };

    const results = await runSetups("echo done", [wt], mockStderr);
    expect(results[0].success).toBe(true);
    expect(await isSetupDone(tmpDir, sha)).toBe(true);
  });

  it("failed setup does not write marker file", async () => {
    const sha = "e".repeat(40);
    const wt: Worktree = { ref: "main", sha, path: tmpDir };
    const results = await runSetups("exit 1", [wt], mockStderr);

    expect(results[0].success).toBe(false);
    expect(results[0].exitCode).toBe(1);
    expect(await isSetupDone(tmpDir, sha)).toBe(false);
    expect(stderrOutput).toContain("Skipping all iterations");
  });

  it("other refs continue after one ref's setup fails", async () => {
    const dir1 = path.join(tmpDir, "wt1");
    const dir2 = path.join(tmpDir, "wt2");
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });
    const realDir1 = realpathSync(dir1);

    const worktrees: Worktree[] = [
      { ref: "failing", sha: "f".repeat(40), path: dir1 },
      { ref: "passing", sha: "a".repeat(40), path: dir2 },
    ];

    const results = await runSetups(
      'if [ "$PWD" = "' + realDir1 + '" ]; then exit 1; else echo ok; fi',
      worktrees,
      mockStderr,
    );

    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });
});
