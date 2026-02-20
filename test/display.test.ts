import { describe, it, expect } from "vitest";
import { LiveDisplay, type DisplayConfig, type IterationResult } from "../src/display.js";

function makeDisplayConfig(overrides: Partial<DisplayConfig> = {}): DisplayConfig {
  return {
    chromeVersions: ["120.0.6099.109", "121.0.6167.85", "122.0.6261.94"],
    refs: ["main", "v4.5.0", "v5.0.0-beta.1"],
    iterations: 5,
    warmupTotal: 9,
    totalIterations: 45,
    workers: 4,
    isTTY: false, // Use non-TTY mode for deterministic testing
    ...overrides,
  };
}

describe("LiveDisplay", () => {
  describe("non-TTY mode (log lines)", () => {
    it("outputs log line for successful iteration", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig(),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 4523,
        exitCode: 0,
      });

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("[ 1/45]");
      expect(output[0]).toContain("chrome@120 x main (e7f8a9b)");
      expect(output[0]).toContain("#0");
      expect(output[0]).toContain("4523ms");
      expect(output[0]).not.toContain("FAIL");
      expect(output[0]).not.toContain("exit:");
    });

    it("outputs FAIL line with stderr for failed iteration", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig(),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "v5.0.0-beta.1",
        sha: "f9a0b1c",
        iteration: 2,
        durationMs: 2455,
        exitCode: 1,
        stderr: "Error: Timed out waiting for selector\n    at bench.spec.ts:5:15",
      });

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("FAIL");
      expect(output[0]).toContain("Error: Timed out");
      expect(output[0]).toContain("bench.spec.ts:5:15");
    });

    it("tracks completion count across iterations", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ totalIterations: 3 }),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 0,
      });
      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 1,
        durationMs: 100,
        exitCode: 0,
      });

      expect(output[0]).toContain("[1/3]");
      expect(output[1]).toContain("[2/3]");
    });

    it("outputs warmup lines with warmup tag", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ warmupTotal: 3 }),
        (msg) => output.push(msg)
      );

      display.onWarmupComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        durationMs: 4102,
      });

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("[warmup]");
      expect(output[0]).toContain("chrome@120 x main (e7f8a9b)");
      expect(output[0]).toContain("4102ms");
    });

    it("outputs completion summary", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ totalIterations: 1 }),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 0,
      });
      display.onComplete(1234);

      const summary = output[output.length - 1];
      expect(summary).toContain("1 runs");
      expect(summary).toContain("runs.jsonl");
    });

    it("includes failure count in completion summary", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ totalIterations: 2 }),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 0,
      });
      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 1,
        durationMs: 100,
        exitCode: 1,
      });
      display.onComplete(2000);

      const summary = output[output.length - 1];
      expect(summary).toContain("1 failed");
    });
  });

  describe("TTY mode (header rendering)", () => {
    it("produces ANSI output in TTY mode", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ isTTY: true, columns: 120, rows: 30 }),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 4523,
        exitCode: 0,
      });

      // Should contain ANSI escape sequences
      const fullOutput = output.join("");
      expect(fullOutput).toContain("\x1b[");
    });

    it("renders matrix header with bars", () => {
      const output: string[] = [];
      const display = new LiveDisplay(
        makeDisplayConfig({ isTTY: true, columns: 120, rows: 30 }),
        (msg) => output.push(msg)
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 4523,
        exitCode: 0,
      });

      const fullOutput = output.join("");
      expect(fullOutput).toContain("chrome@120");
      expect(fullOutput).toContain("chrome-ranger run");
    });
  });

  describe("cell state tracking", () => {
    it("tracks per-cell pass counts", () => {
      const display = new LiveDisplay(
        makeDisplayConfig(),
        () => {}
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 0,
      });
      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 1,
        durationMs: 100,
        exitCode: 0,
      });

      const state = display.getCellState("120.0.6099.109", "main");
      expect(state.passed).toBe(2);
      expect(state.failed).toBe(0);
    });

    it("tracks per-cell fail counts", () => {
      const display = new LiveDisplay(
        makeDisplayConfig(),
        () => {}
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 1,
      });

      const state = display.getCellState("120.0.6099.109", "main");
      expect(state.passed).toBe(0);
      expect(state.failed).toBe(1);
    });

    it("tracks total completed and failed", () => {
      const display = new LiveDisplay(
        makeDisplayConfig({ totalIterations: 3 }),
        () => {}
      );

      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        durationMs: 100,
        exitCode: 0,
      });
      display.onIterationComplete({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 1,
        durationMs: 100,
        exitCode: 1,
      });

      expect(display.completed).toBe(2);
      expect(display.failed).toBe(1);
    });
  });

  describe("worker tracking", () => {
    it("registers and removes active workers", () => {
      const display = new LiveDisplay(
        makeDisplayConfig(),
        () => {}
      );

      display.setWorkerActive(1, "chrome@120 x main #0");
      expect(display.getActiveWorkers()).toHaveLength(1);

      display.setWorkerIdle(1);
      expect(display.getActiveWorkers()).toHaveLength(0);
    });
  });
});
