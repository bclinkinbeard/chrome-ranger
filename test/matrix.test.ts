import { describe, it, expect } from "vitest";
import {
  buildMatrix,
  computePending,
  type MatrixCell,
  type RunMeta,
} from "../src/matrix.js";
import type { Config } from "../src/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    command: "echo test",
    iterations: 5,
    warmup: 0,
    workers: 1,
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
    sha: "abc1234",
    iteration: 0,
    timestamp: "2026-02-18T10:30:00.000Z",
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("Matrix Computation", () => {
  describe("buildMatrix", () => {
    it("generates full matrix: 2 chrome × 2 refs × 3 iterations = 12 cells", () => {
      const config = makeConfig({ iterations: 3 });
      const shaMap = new Map([
        ["main", "abc1234"],
        ["v4.5.0", "def5678"],
      ]);
      const matrix = buildMatrix(config, shaMap);
      expect(matrix).toHaveLength(12);
    });

    it("generates 1×1×1 = 1 cell", () => {
      const config = makeConfig({
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"] },
        code: { repo: ".", refs: ["main"] },
      });
      const shaMap = new Map([["main", "abc1234"]]);
      const matrix = buildMatrix(config, shaMap);
      expect(matrix).toHaveLength(1);
      expect(matrix[0]).toEqual({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "abc1234",
        iteration: 0,
      });
    });

    it("generates large matrix: 5×5×10 = 250 cells", () => {
      const versions = ["v1", "v2", "v3", "v4", "v5"];
      const refs = ["r1", "r2", "r3", "r4", "r5"];
      const config = makeConfig({
        iterations: 10,
        chrome: { versions },
        code: { repo: ".", refs },
      });
      const shaMap = new Map(refs.map((r) => [r, `sha-${r}`]));
      const matrix = buildMatrix(config, shaMap);
      expect(matrix).toHaveLength(250);
    });

    it("assigns correct chrome/ref/sha/iteration to each cell", () => {
      const config = makeConfig({
        iterations: 2,
        chrome: { versions: ["120.0.6099.109"] },
        code: { repo: ".", refs: ["main"] },
      });
      const shaMap = new Map([["main", "abc1234"]]);
      const matrix = buildMatrix(config, shaMap);
      expect(matrix).toEqual([
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 1 },
      ]);
    });
  });

  describe("computePending", () => {
    it("returns all cells when runs.jsonl is empty", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 1 },
      ];
      const pending = computePending(matrix, []);
      expect(pending).toHaveLength(2);
    });

    it("returns nothing when all cells have exitCode: 0 runs", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 1 },
      ];
      const runs: RunMeta[] = [
        makeRun({ iteration: 0 }),
        makeRun({ iteration: 1 }),
      ];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(0);
    });

    it("keeps cell with exitCode: 1 run as pending", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
      ];
      const runs: RunMeta[] = [makeRun({ iteration: 0, exitCode: 1 })];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(1);
    });

    it("marks cell complete if it has both failed and successful runs", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
      ];
      const runs: RunMeta[] = [
        makeRun({ id: "r1", iteration: 0, exitCode: 1 }),
        makeRun({ id: "r2", iteration: 0, exitCode: 0 }),
      ];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(0);
    });

    it("returns only incomplete cells in a mixed matrix", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 1 },
        {
          chrome: "121.0.6167.85",
          ref: "main",
          sha: "abc1234",
          iteration: 0,
        },
      ];
      const runs: RunMeta[] = [
        makeRun({ iteration: 0, exitCode: 0 }),
        makeRun({ iteration: 1, exitCode: 1 }),
      ];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(2);
      expect(pending).toContainEqual({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "abc1234",
        iteration: 1,
      });
      expect(pending).toContainEqual({
        chrome: "121.0.6167.85",
        ref: "main",
        sha: "abc1234",
        iteration: 0,
      });
    });
  });

  describe("SHA-based matching", () => {
    it("counts runs toward completion when SHA matches", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "abc1234", iteration: 0 },
      ];
      const runs: RunMeta[] = [makeRun({ sha: "abc1234", exitCode: 0 })];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(0);
    });

    it("does not count runs when SHA differs (branch advanced)", () => {
      const matrix: MatrixCell[] = [
        { chrome: "120.0.6099.109", ref: "main", sha: "new5678", iteration: 0 },
      ];
      const runs: RunMeta[] = [makeRun({ sha: "old1234", exitCode: 0 })];
      const pending = computePending(matrix, runs);
      expect(pending).toHaveLength(1);
    });
  });
});
