import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadRuns, appendRun, writeRuns, removeRuns } from "../src/runs.js";
import type { RunMeta } from "../src/types.js";

const TMP = resolve(import.meta.dirname, ".tmp-runs-test");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function makeMeta(id: string, overrides?: Partial<RunMeta>): RunMeta {
  return {
    id,
    chrome: "120.0.6099.109",
    ref: "main",
    sha: "abc1234",
    iteration: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("loadRuns", () => {
  it("returns empty array for non-existent file", () => {
    const runs = loadRuns(resolve(TMP, "nonexistent.jsonl"));
    expect(runs).toEqual([]);
  });

  it("parses JSONL correctly", () => {
    const path = resolve(TMP, "runs.jsonl");
    const run1 = makeMeta("id1");
    const run2 = makeMeta("id2", { iteration: 1 });
    writeFileSync(path, JSON.stringify(run1) + "\n" + JSON.stringify(run2) + "\n");

    const runs = loadRuns(path);
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe("id1");
    expect(runs[1].id).toBe("id2");
  });

  it("handles trailing newline", () => {
    const path = resolve(TMP, "runs.jsonl");
    writeFileSync(path, JSON.stringify(makeMeta("id1")) + "\n\n");
    const runs = loadRuns(path);
    expect(runs).toHaveLength(1);
  });
});

describe("appendRun", () => {
  it("creates file and appends", () => {
    const path = resolve(TMP, "sub", "runs.jsonl");
    const run = makeMeta("id1");
    appendRun(path, run);

    const content = readFileSync(path, "utf-8");
    expect(content).toBe(JSON.stringify(run) + "\n");
  });

  it("appends to existing file", () => {
    const path = resolve(TMP, "runs.jsonl");
    appendRun(path, makeMeta("id1"));
    appendRun(path, makeMeta("id2"));

    const runs = loadRuns(path);
    expect(runs).toHaveLength(2);
  });
});

describe("writeRuns", () => {
  it("overwrites file contents", () => {
    const path = resolve(TMP, "runs.jsonl");
    appendRun(path, makeMeta("id1"));
    appendRun(path, makeMeta("id2"));
    appendRun(path, makeMeta("id3"));

    writeRuns(path, [makeMeta("id2")]);
    const runs = loadRuns(path);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("id2");
  });
});

describe("removeRuns", () => {
  it("removes matching runs and their output files", () => {
    const path = resolve(TMP, "runs.jsonl");
    // outputDir(cwd) returns cwd/.chrome-ranger/output/
    const outDir = resolve(TMP, ".chrome-ranger", "output");
    mkdirSync(outDir, { recursive: true });

    appendRun(path, makeMeta("id1", { chrome: "v1" }));
    appendRun(path, makeMeta("id2", { chrome: "v2" }));

    // Create output files
    writeFileSync(resolve(outDir, "id1.stdout"), "out1");
    writeFileSync(resolve(outDir, "id1.stderr"), "err1");
    writeFileSync(resolve(outDir, "id2.stdout"), "out2");
    writeFileSync(resolve(outDir, "id2.stderr"), "err2");

    // Remove runs with chrome v1
    const removed = removeRuns(path, TMP, (r) => r.chrome === "v1");
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe("id1");

    // Remaining runs
    const remaining = loadRuns(path);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("id2");

    // Output files for removed runs should be gone
    expect(existsSync(resolve(outDir, "id1.stdout"))).toBe(false);
    expect(existsSync(resolve(outDir, "id1.stderr"))).toBe(false);

    // Output files for remaining runs should still exist
    expect(existsSync(resolve(outDir, "id2.stdout"))).toBe(true);
    expect(existsSync(resolve(outDir, "id2.stderr"))).toBe(true);
  });
});
