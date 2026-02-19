import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Writable } from "node:stream";
import { runWarmups } from "../warmup.js";
import { ensureDataDir, loadRuns, runsJsonlPath } from "../runs.js";
import type { WarmupTask } from "../types.js";

let tmpDir: string;
let stderrOutput: string;
let mockStderr: Writable;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-warmup-"));
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

function makeWarmupTask(
  overrides: Partial<WarmupTask> = {},
): WarmupTask {
  return {
    chrome: "120.0.6099.109",
    chromeBin: "/usr/bin/false",
    ref: "main",
    sha: "abc1234567890",
    codeDir: tmpDir,
    ...overrides,
  };
}

describe("runWarmups", () => {
  it("no runs.jsonl entries for warmup iterations", async () => {
    const result = await runWarmups(
      [makeWarmupTask()],
      2,
      "echo warmup",
      1,
      mockStderr,
    );

    expect(result.passed).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    // No runs should be written
    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(0);
  });

  it("no output files for warmup iterations", async () => {
    await runWarmups(
      [makeWarmupTask()],
      1,
      "echo warmup",
      1,
      mockStderr,
    );

    const outDir = path.join(tmpDir, ".chrome-ranger", "output");
    const files = await fs.readdir(outDir);
    expect(files).toHaveLength(0);
  });

  it("warmup failure marks cell as failed", async () => {
    const result = await runWarmups(
      [makeWarmupTask()],
      1,
      "exit 1",
      1,
      mockStderr,
    );

    expect(result.passed).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].chrome).toBe("120.0.6099.109");
    expect(result.failed[0].ref).toBe("main");
  });

  it("other cells continue after one cell's warmup fails", async () => {
    const dir2 = path.join(tmpDir, "wt2");
    await fs.mkdir(dir2, { recursive: true });

    const tasks = [
      makeWarmupTask({ chrome: "120", codeDir: tmpDir }),
      makeWarmupTask({ chrome: "121", codeDir: dir2 }),
    ];

    const result = await runWarmups(
      tasks,
      1,
      'if [ "$CHROME_VERSION" = "120" ]; then exit 1; else echo ok; fi',
      1,
      mockStderr,
    );

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].chrome).toBe("120");
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0].chrome).toBe("121");
  });

  it("progress lines use [warmup] label", async () => {
    await runWarmups(
      [makeWarmupTask()],
      1,
      "echo warmup",
      1,
      mockStderr,
    );

    expect(stderrOutput).toContain("[warmup]");
    expect(stderrOutput).toContain("chrome@120");
  });

  it("warmup count is per cell", async () => {
    const dir2 = path.join(tmpDir, "wt2");
    await fs.mkdir(dir2, { recursive: true });

    const tasks = [
      makeWarmupTask({ chrome: "120", ref: "main" }),
      makeWarmupTask({ chrome: "120", ref: "v1", codeDir: dir2 }),
    ];

    let count = 0;
    const result = await runWarmups(
      tasks,
      2, // 2 warmups per cell = 4 total
      "echo warmup",
      1,
      mockStderr,
    );

    // Count [warmup] lines in stderr
    const warmupLines = stderrOutput
      .split("\n")
      .filter((l) => l.includes("[warmup]"));
    expect(warmupLines).toHaveLength(4);
    expect(result.passed).toHaveLength(2);
  });
});
