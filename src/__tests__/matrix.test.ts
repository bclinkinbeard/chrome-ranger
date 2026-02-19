import { describe, it, expect } from "vitest";
import {
  generateMatrix,
  computePending,
  filterMatrix,
  computeAppend,
} from "../matrix.js";
import type { RunMeta, ResolvedRef } from "../types.js";

function makeRun(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id: "test-id",
    chrome: "120",
    ref: "main",
    sha: "abc1234",
    iteration: 0,
    timestamp: "2026-02-18T10:30:00Z",
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("generateMatrix", () => {
  it("produces correct cartesian product", () => {
    const refs: ResolvedRef[] = [
      { ref: "main", sha: "aaa" },
      { ref: "v1", sha: "bbb" },
    ];
    const cells = generateMatrix(["120", "121"], refs, 3);

    expect(cells).toHaveLength(12); // 2 × 2 × 3
  });

  it("1 chrome × 1 ref × 1 iteration = 1 cell", () => {
    const cells = generateMatrix(["120"], [{ ref: "main", sha: "aaa" }], 1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({
      chrome: "120",
      ref: "main",
      sha: "aaa",
      iteration: 0,
    });
  });

  it("large matrix: 5 × 5 × 10 = 250 cells", () => {
    const chromes = ["a", "b", "c", "d", "e"];
    const refs = chromes.map((c) => ({ ref: c, sha: c }));
    const cells = generateMatrix(chromes, refs, 10);
    expect(cells).toHaveLength(250);
  });
});

describe("computePending", () => {
  const matrix = generateMatrix(
    ["120", "121"],
    [
      { ref: "main", sha: "aaa" },
      { ref: "v1", sha: "bbb" },
    ],
    2,
  );

  it("returns all cells when no runs exist", () => {
    const pending = computePending(matrix, []);
    expect(pending).toHaveLength(8); // 2 × 2 × 2
  });

  it("returns empty when all cells have exitCode:0 runs", () => {
    const runs = matrix.map((cell) =>
      makeRun({
        chrome: cell.chrome,
        sha: cell.sha,
        iteration: cell.iteration,
        exitCode: 0,
      }),
    );
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(0);
  });

  it("keeps cells where only failed runs exist", () => {
    const runs = [
      makeRun({ chrome: "120", sha: "aaa", iteration: 0, exitCode: 1 }),
    ];
    const pending = computePending(matrix, runs);
    // The cell with chrome:120, sha:aaa, iteration:0 should still be pending
    expect(pending).toHaveLength(8);
  });

  it("removes cells where at least one exitCode:0 run exists", () => {
    const runs = [
      makeRun({ chrome: "120", sha: "aaa", iteration: 0, exitCode: 1 }),
      makeRun({
        chrome: "120",
        sha: "aaa",
        iteration: 0,
        exitCode: 0,
        id: "success",
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(7);
  });

  it("matches by SHA, not ref name", () => {
    // Runs recorded against old SHA should not count
    const runs = [
      makeRun({
        chrome: "120",
        ref: "main",
        sha: "OLD_SHA",
        iteration: 0,
        exitCode: 0,
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(8); // still all pending
  });

  it("ignores runs for SHA values not in the matrix", () => {
    const runs = [
      makeRun({
        chrome: "999",
        sha: "zzz",
        iteration: 0,
        exitCode: 0,
      }),
    ];
    const pending = computePending(matrix, runs);
    expect(pending).toHaveLength(8);
  });
});

describe("filterMatrix", () => {
  const matrix = generateMatrix(
    ["120", "121"],
    [
      { ref: "main", sha: "aaa" },
      { ref: "v1", sha: "bbb" },
    ],
    1,
  );

  it("chrome filter keeps only matching versions", () => {
    const result = filterMatrix(matrix, ["120"]);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.chrome === "120")).toBe(true);
  });

  it("refs filter keeps only matching refs", () => {
    const result = filterMatrix(matrix, undefined, ["main"]);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.ref === "main")).toBe(true);
  });

  it("both filters apply AND logic", () => {
    const result = filterMatrix(matrix, ["120"], ["main"]);
    expect(result).toHaveLength(1);
    expect(result[0].chrome).toBe("120");
    expect(result[0].ref).toBe("main");
  });

  it("no filters returns all cells", () => {
    const result = filterMatrix(matrix);
    expect(result).toHaveLength(4);
  });
});

describe("computeAppend", () => {
  const refs: ResolvedRef[] = [
    { ref: "main", sha: "aaa" },
    { ref: "v1", sha: "bbb" },
  ];

  it("continues iteration numbering from max existing", () => {
    const existingRuns = [
      makeRun({ chrome: "120", sha: "aaa", iteration: 0 }),
      makeRun({ chrome: "120", sha: "aaa", iteration: 1 }),
      makeRun({ chrome: "120", sha: "aaa", iteration: 2 }),
    ];
    const cells = computeAppend(["120"], refs, existingRuns, 2);

    const mainCells = cells.filter((c) => c.ref === "main");
    expect(mainCells).toHaveLength(2);
    expect(mainCells[0].iteration).toBe(3);
    expect(mainCells[1].iteration).toBe(4);
  });

  it("starts at iteration 0 when no existing runs", () => {
    const cells = computeAppend(["120"], refs, [], 2);

    const mainCells = cells.filter(
      (c) => c.ref === "main" && c.chrome === "120",
    );
    expect(mainCells).toHaveLength(2);
    expect(mainCells[0].iteration).toBe(0);
    expect(mainCells[1].iteration).toBe(1);
  });

  it("respects chrome/refs filters", () => {
    const cells = computeAppend(
      ["120", "121"],
      refs,
      [],
      1,
      ["120"],
      ["main"],
    );
    expect(cells).toHaveLength(1);
    expect(cells[0].chrome).toBe("120");
    expect(cells[0].ref).toBe("main");
  });
});
