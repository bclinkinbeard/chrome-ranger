import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Writable } from "node:stream";
import { runPool } from "../pool.js";
import { loadRuns, ensureDataDir } from "../runs.js";
import type { PoolTask } from "../types.js";

let tmpDir: string;
let stderrOutput: string;
let mockStderr: Writable;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-pool-"));
  await ensureDataDir(tmpDir);
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

function makeTask(overrides: Partial<PoolTask["cell"]> = {}): PoolTask {
  return {
    cell: {
      chrome: "120.0.6099.109",
      ref: "main",
      sha: "abc1234567890",
      iteration: 0,
      ...overrides,
    },
    chromeBin: "/usr/bin/false",
    codeDir: tmpDir,
  };
}

describe("runPool", () => {
  it("empty task list returns zero counts", async () => {
    const result = await runPool([], {
      workers: 1,
      command: "echo test",
      projectDir: tmpDir,
      stderr: mockStderr,
    });
    expect(result).toEqual({ total: 0, completed: 0, failed: 0 });
  });

  it("single task produces runs.jsonl entry and output files", async () => {
    const result = await runPool([makeTask()], {
      workers: 1,
      command: "echo hello",
      projectDir: tmpDir,
      stderr: mockStderr,
    });

    expect(result.total).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);

    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(1);
    expect(runs[0].exitCode).toBe(0);

    // Output files should exist
    const outDir = path.join(tmpDir, ".chrome-ranger", "output");
    const files = await fs.readdir(outDir);
    expect(files.length).toBeGreaterThanOrEqual(2); // .stdout and .stderr
  });

  it("failed command produces correct counts", async () => {
    const result = await runPool([makeTask()], {
      workers: 1,
      command: "exit 1",
      projectDir: tmpDir,
      stderr: mockStderr,
    });

    expect(result.total).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("progress lines are emitted to stderr", async () => {
    await runPool([makeTask()], {
      workers: 1,
      command: "echo ok",
      projectDir: tmpDir,
      stderr: mockStderr,
    });

    expect(stderrOutput).toContain("chrome@120");
    expect(stderrOutput).toContain("main");
    expect(stderrOutput).toContain("exit:0");
  });

  it("runs.jsonl contains valid JSON under concurrent workers", async () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTask({ iteration: i }),
    );

    await runPool(tasks, {
      workers: 2,
      command: "echo test",
      projectDir: tmpDir,
      stderr: mockStderr,
    });

    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      expect(run.id).toBeTruthy();
      expect(run.exitCode).toBe(0);
    }
  });
});
