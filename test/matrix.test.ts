import { describe, it, expect } from "vitest";
import {
  computeFullMatrix,
  computePending,
  computeAppendRuns,
  computeStatus,
} from "../src/matrix.js";
import type { Config, RunMeta, ResolvedRef } from "../src/types.js";

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    command: "echo test",
    iterations: 3,
    warmup: 0,
    workers: 1,
    chrome: { versions: ["120.0.6099.109", "121.0.6167.85"] },
    code: { repo: ".", refs: ["main", "feature"] },
    ...overrides,
  };
}

function makeRef(ref: string, sha: string): ResolvedRef {
  return { ref, sha, worktreeDir: `/tmp/wt/${ref}` };
}

function makeRun(
  overrides: Partial<RunMeta> & Pick<RunMeta, "chrome" | "sha" | "iteration">,
): RunMeta {
  return {
    id: "test-id",
    ref: "main",
    timestamp: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("computeFullMatrix", () => {
  it("generates correct number of cells", () => {
    const config = makeConfig({ iterations: 3 });
    const refs = [makeRef("main", "aaa"), makeRef("feature", "bbb")];
    const matrix = computeFullMatrix(config, refs);
    // 2 chrome × 2 refs × 3 iterations = 12
    expect(matrix).toHaveLength(12);
  });

  it("generates correct cell data", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["120.0.6099.109"];
    const refs = [makeRef("main", "abc1234")];
    const matrix = computeFullMatrix(config, refs);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toEqual({
      chrome: "120.0.6099.109",
      ref: "main",
      sha: "abc1234",
      iteration: 0,
    });
  });

  it("handles large matrices", () => {
    const config = makeConfig({ iterations: 10 });
    config.chrome.versions = ["v1", "v2", "v3", "v4", "v5"];
    const refs = Array.from({ length: 5 }, (_, i) =>
      makeRef(`ref${i}`, `sha${i}`),
    );
    const matrix = computeFullMatrix(config, refs);
    expect(matrix).toHaveLength(250);
  });
});

describe("computePending", () => {
  it("returns all cells when no runs exist", () => {
    const config = makeConfig({ iterations: 2 });
    const refs = [makeRef("main", "aaa")];
    const matrix = computeFullMatrix(config, refs);
    const pending = computePending(matrix, []);
    expect(pending).toHaveLength(matrix.length);
  });

  it("returns nothing when all cells have exitCode 0", () => {
    const config = makeConfig({ iterations: 2 });
    config.chrome.versions = ["120.0.6099.109"];
    const refs = [makeRef("main", "aaa")];
    const matrix = computeFullMatrix(config, refs);
    const runs = [
      makeRun({ chrome: "120.0.6099.109", sha: "aaa", iteration: 0 }),
      makeRun({ chrome: "120.0.6099.109", sha: "aaa", iteration: 1 }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(0);
  });

  it("considers failed runs as still pending", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["120.0.6099.109"];
    const refs = [makeRef("main", "aaa")];
    const matrix = computeFullMatrix(config, refs);
    const runs = [
      makeRun({
        chrome: "120.0.6099.109",
        sha: "aaa",
        iteration: 0,
        exitCode: 1,
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(1);
  });

  it("considers cell complete when at least one successful run exists", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["120.0.6099.109"];
    const refs = [makeRef("main", "aaa")];
    const matrix = computeFullMatrix(config, refs);
    const runs = [
      makeRun({
        chrome: "120.0.6099.109",
        sha: "aaa",
        iteration: 0,
        exitCode: 1,
      }),
      makeRun({
        chrome: "120.0.6099.109",
        sha: "aaa",
        iteration: 0,
        exitCode: 0,
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(0);
  });

  it("does not count runs for a different SHA", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["120.0.6099.109"];
    const refs = [makeRef("main", "new-sha")];
    const matrix = computeFullMatrix(config, refs);
    const runs = [
      makeRun({
        chrome: "120.0.6099.109",
        sha: "old-sha",
        iteration: 0,
        exitCode: 0,
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(1);
  });

  it("returns mix of complete and incomplete", () => {
    const config = makeConfig({ iterations: 2 });
    config.chrome.versions = ["v1", "v2"];
    const refs = [makeRef("main", "aaa")];
    const matrix = computeFullMatrix(config, refs);
    const runs = [
      makeRun({ chrome: "v1", sha: "aaa", iteration: 0, exitCode: 0 }),
      makeRun({ chrome: "v1", sha: "aaa", iteration: 1, exitCode: 0 }),
      // v2 iteration 0 failed, iteration 1 missing
      makeRun({ chrome: "v2", sha: "aaa", iteration: 0, exitCode: 1 }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(2); // v2 iteration 0 and 1
  });
});

describe("computeAppendRuns", () => {
  it("appends N runs starting from max iteration + 1", () => {
    const config = makeConfig({ iterations: 2 });
    config.chrome.versions = ["v1"];
    const refs = [makeRef("main", "aaa")];
    const existing = [
      makeRun({ chrome: "v1", sha: "aaa", iteration: 0 }),
      makeRun({ chrome: "v1", sha: "aaa", iteration: 1 }),
    ];
    const appended = computeAppendRuns(config, refs, existing, 3);
    expect(appended).toHaveLength(3);
    expect(appended.map((r) => r.iteration)).toEqual([2, 3, 4]);
  });

  it("starts at 0 when no existing runs", () => {
    const config = makeConfig({ iterations: 2 });
    config.chrome.versions = ["v1"];
    const refs = [makeRef("main", "aaa")];
    const appended = computeAppendRuns(config, refs, [], 2);
    expect(appended.map((r) => r.iteration)).toEqual([0, 1]);
  });

  it("respects chrome filter", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["v1", "v2"];
    const refs = [makeRef("main", "aaa")];
    const appended = computeAppendRuns(config, refs, [], 1, ["v1"]);
    expect(appended).toHaveLength(1);
    expect(appended[0].chrome).toBe("v1");
  });

  it("respects refs filter", () => {
    const config = makeConfig({ iterations: 1 });
    config.chrome.versions = ["v1"];
    const refs = [makeRef("main", "aaa"), makeRef("feat", "bbb")];
    const appended = computeAppendRuns(
      config,
      refs,
      [],
      1,
      undefined,
      ["main"],
    );
    expect(appended).toHaveLength(1);
    expect(appended[0].ref).toBe("main");
  });
});

describe("computeStatus", () => {
  it("returns cells with correct counts", () => {
    const config = makeConfig({ iterations: 5 });
    config.chrome.versions = ["v1"];
    const refs = [makeRef("main", "aaa")];
    const runs = [
      makeRun({ chrome: "v1", sha: "aaa", iteration: 0, exitCode: 0 }),
      makeRun({ chrome: "v1", sha: "aaa", iteration: 1, exitCode: 0 }),
      makeRun({ chrome: "v1", sha: "aaa", iteration: 2, exitCode: 1 }),
    ];
    const cells = computeStatus(config, refs, runs);
    expect(cells).toHaveLength(1);
    expect(cells[0].successCount).toBe(2);
    expect(cells[0].failedCount).toBe(1);
    expect(cells[0].target).toBe(5);
  });

  it("returns all zeros with no runs", () => {
    const config = makeConfig({ iterations: 3 });
    config.chrome.versions = ["v1", "v2"];
    const refs = [makeRef("main", "aaa")];
    const cells = computeStatus(config, refs, []);
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.successCount).toBe(0);
      expect(cell.failedCount).toBe(0);
    }
  });
});
