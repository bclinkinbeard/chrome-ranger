import { describe, it, expect } from "vitest";
import { formatStatusJson, type StatusJson } from "../src/status-json.js";
import type { Config } from "../src/config.js";
import type { RunMeta } from "../src/matrix.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    command: "npx playwright test tests/bench.spec.ts",
    iterations: 5,
    warmup: 1,
    workers: 4,
    chrome: { versions: ["120.0.6099.109", "121.0.6167.85"] },
    code: { repo: ".", refs: ["main", "v4.5.0"] },
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id: "test-id",
    chrome: "120.0.6099.109",
    ref: "main",
    sha: "e7f8a9b",
    iteration: 0,
    timestamp: "2026-02-18T10:30:00.000Z",
    durationMs: 4000,
    exitCode: 0,
    ...overrides,
  };
}

describe("formatStatusJson", () => {
  it("returns version 1", () => {
    const config = makeConfig();
    const shaMap = new Map([["main", "e7f8a9b"], ["v4.5.0", "c3d4e5f"]]);
    const result = formatStatusJson(config, [], shaMap);
    expect(result.version).toBe(1);
  });

  it("includes config section", () => {
    const config = makeConfig();
    const shaMap = new Map([["main", "e7f8a9b"], ["v4.5.0", "c3d4e5f"]]);
    const result = formatStatusJson(config, [], shaMap);
    expect(result.config.iterations).toBe(5);
    expect(result.config.warmup).toBe(1);
    expect(result.config.workers).toBe(4);
    expect(result.config.command).toBe("npx playwright test tests/bench.spec.ts");
  });

  it("includes matrix chrome versions and refs with SHAs", () => {
    const config = makeConfig();
    const shaMap = new Map([["main", "e7f8a9b"], ["v4.5.0", "c3d4e5f"]]);
    const result = formatStatusJson(config, [], shaMap);
    expect(result.matrix.chrome).toEqual(["120.0.6099.109", "121.0.6167.85"]);
    expect(result.matrix.refs).toEqual([
      { name: "main", sha: "e7f8a9b" },
      { name: "v4.5.0", sha: "c3d4e5f" },
    ]);
  });

  it("computes summary correctly", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0, timestamp: "2026-02-18T10:30:00.000Z" }),
      makeRun({ id: "r1", iteration: 1, exitCode: 1, timestamp: "2026-02-18T10:30:05.000Z" }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    expect(result.summary.totalRuns).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.cellsTotal).toBe(1);
    expect(result.summary.cellsWithFailures).toBe(1);
    expect(result.summary.firstRun).toBe("2026-02-18T10:30:00.000Z");
    expect(result.summary.lastRun).toBe("2026-02-18T10:30:05.000Z");
  });

  it("builds hierarchical cells with nested runs", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0, durationMs: 3688 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 0, durationMs: 4523 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    expect(result.cells).toHaveLength(1);
    const cell = result.cells[0];
    expect(cell.chrome).toBe("120.0.6099.109");
    expect(cell.ref).toBe("main");
    expect(cell.sha).toBe("e7f8a9b");
    expect(cell.target).toBe(2);
    expect(cell.passed).toBe(2);
    expect(cell.failed).toBe(0);
    expect(cell.complete).toBe(true);
    expect(cell.runs).toHaveLength(2);
  });

  it("computes stats over passing runs only", () => {
    const config = makeConfig({
      iterations: 3,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0, durationMs: 3000 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 1, durationMs: 99999 }),
      makeRun({ id: "r2", iteration: 2, exitCode: 0, durationMs: 5000 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    const cell = result.cells[0];
    expect(cell.stats).toBeDefined();
    expect(cell.stats!.minMs).toBe(3000);
    expect(cell.stats!.maxMs).toBe(5000);
    expect(cell.stats!.meanMs).toBe(4000);
    expect(cell.stats!.medianMs).toBe(4000); // median of [3000, 5000]
  });

  it("omits stats for cells with zero successful runs", () => {
    const config = makeConfig({
      iterations: 1,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 1 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    expect(result.cells[0].stats).toBeUndefined();
  });

  it("marks cell complete when passed >= target", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 0 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    expect(result.cells[0].complete).toBe(true);
  });

  it("marks cell incomplete when passed < target", () => {
    const config = makeConfig({
      iterations: 3,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 1 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    expect(result.cells[0].complete).toBe(false);
  });

  it("includes remaining count in summary", () => {
    const config = makeConfig({
      iterations: 5,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 0 }),
    ];

    const result = formatStatusJson(config, runs, shaMap);
    // 5 target - 2 passed = 3 remaining
    expect(result.summary.remaining).toBe(3);
  });

  it("creates cells for empty chrome×ref combinations", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main", "v4.5.0"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"], ["v4.5.0", "c3d4e5f"]]);

    const result = formatStatusJson(config, [], shaMap);
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0].passed).toBe(0);
    expect(result.cells[1].passed).toBe(0);
  });
});
