import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ensureDataDir,
  loadRuns,
  appendRun,
  writeStdout,
  writeStderr,
  deleteRuns,
  runsJsonlPath,
  stdoutPath,
  stderrPath,
} from "../runs.js";
import type { RunMeta } from "../types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-runs-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeRun(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id: "test-id-1",
    chrome: "120.0.6099.109",
    ref: "main",
    sha: "abc1234567890",
    iteration: 0,
    timestamp: "2026-02-18T10:30:00.000Z",
    durationMs: 4523,
    exitCode: 0,
    ...overrides,
  };
}

describe("ensureDataDir", () => {
  it("creates .chrome-ranger/ and output/ if they don't exist", async () => {
    await ensureDataDir(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, ".chrome-ranger", "output"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent", async () => {
    await ensureDataDir(tmpDir);
    await ensureDataDir(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, ".chrome-ranger", "output"));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("loadRuns", () => {
  it("returns [] when runs.jsonl doesn't exist", async () => {
    const runs = await loadRuns(tmpDir);
    expect(runs).toEqual([]);
  });

  it("returns [] for an empty file", async () => {
    await ensureDataDir(tmpDir);
    await fs.writeFile(runsJsonlPath(tmpDir), "", "utf-8");
    const runs = await loadRuns(tmpDir);
    expect(runs).toEqual([]);
  });

  it("parses valid JSONL", async () => {
    await ensureDataDir(tmpDir);
    const run1 = makeRun({ id: "id1" });
    const run2 = makeRun({ id: "id2", iteration: 1 });
    const content = JSON.stringify(run1) + "\n" + JSON.stringify(run2) + "\n";
    await fs.writeFile(runsJsonlPath(tmpDir), content, "utf-8");

    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe("id1");
    expect(runs[1].id).toBe("id2");
  });

  it("skips corrupted lines without failing", async () => {
    await ensureDataDir(tmpDir);
    const run = makeRun();
    const content = JSON.stringify(run) + "\n" + "NOT JSON\n";
    await fs.writeFile(runsJsonlPath(tmpDir), content, "utf-8");

    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("test-id-1");
  });

  it("handles trailing newline without phantom entry", async () => {
    await ensureDataDir(tmpDir);
    const run = makeRun();
    await fs.writeFile(
      runsJsonlPath(tmpDir),
      JSON.stringify(run) + "\n\n",
      "utf-8",
    );

    const runs = await loadRuns(tmpDir);
    expect(runs).toHaveLength(1);
  });
});

describe("appendRun", () => {
  it("creates runs.jsonl if it doesn't exist", async () => {
    const run = makeRun();
    await appendRun(tmpDir, run);

    const content = await fs.readFile(runsJsonlPath(tmpDir), "utf-8");
    expect(JSON.parse(content.trim())).toEqual(run);
  });

  it("appends valid JSON line with trailing newline", async () => {
    await appendRun(tmpDir, makeRun({ id: "id1" }));
    await appendRun(tmpDir, makeRun({ id: "id2" }));

    const content = await fs.readFile(runsJsonlPath(tmpDir), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).id).toBe("id1");
    expect(JSON.parse(lines[1]).id).toBe("id2");
  });
});

describe("writeStdout / writeStderr", () => {
  it("creates output files with correct content", async () => {
    await writeStdout(tmpDir, "abc", "hello stdout");
    await writeStderr(tmpDir, "abc", "hello stderr");

    const stdout = await fs.readFile(stdoutPath(tmpDir, "abc"), "utf-8");
    const stderr = await fs.readFile(stderrPath(tmpDir, "abc"), "utf-8");
    expect(stdout).toBe("hello stdout");
    expect(stderr).toBe("hello stderr");
  });

  it("creates empty files for empty content", async () => {
    await writeStdout(tmpDir, "empty", "");
    await writeStderr(tmpDir, "empty", "");

    const stdout = await fs.readFile(stdoutPath(tmpDir, "empty"), "utf-8");
    const stderr = await fs.readFile(stderrPath(tmpDir, "empty"), "utf-8");
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });
});

describe("deleteRuns", () => {
  it("removes matching entries from runs.jsonl", async () => {
    await appendRun(tmpDir, makeRun({ id: "id1", chrome: "120" }));
    await appendRun(tmpDir, makeRun({ id: "id2", chrome: "121" }));
    await writeStdout(tmpDir, "id1", "out1");
    await writeStderr(tmpDir, "id1", "err1");

    const kept = await deleteRuns(tmpDir, (r) => r.chrome === "120");
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("id2");

    // Output files for deleted run should be gone
    await expect(
      fs.access(stdoutPath(tmpDir, "id1")),
    ).rejects.toThrow();
  });

  it("leaves non-matching entries intact", async () => {
    await appendRun(tmpDir, makeRun({ id: "id1", chrome: "120" }));
    await appendRun(tmpDir, makeRun({ id: "id2", chrome: "121" }));

    const kept = await deleteRuns(tmpDir, (r) => r.chrome === "999");
    expect(kept).toHaveLength(2);
  });

  it("handles missing output files without error", async () => {
    await appendRun(tmpDir, makeRun({ id: "id1" }));
    // Don't write output files — deleteRuns should still work
    const kept = await deleteRuns(tmpDir, (r) => r.id === "id1");
    expect(kept).toHaveLength(0);
  });
});
