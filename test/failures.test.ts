import { describe, it, expect } from "vitest";
import { formatFailures } from "../src/failures.js";
import type { Config } from "../src/config.js";
import type { RunMeta } from "../src/matrix.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    command: "npx playwright test tests/bench.spec.ts",
    iterations: 5,
    warmup: 0,
    workers: 1,
    chrome: { versions: ["120.0.6099.109", "122.0.6261.94"] },
    code: { repo: ".", refs: ["main", "v5.0.0-beta.1"] },
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
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("formatFailures", () => {
  it("reports no failures when all pass", () => {
    const config = makeConfig({ iterations: 2 });
    const shaMap = new Map([
      ["main", "e7f8a9b"],
      ["v5.0.0-beta.1", "f9a0b1c"],
    ]);
    const runs = [
      makeRun({ id: "r1", iteration: 0, exitCode: 0 }),
      makeRun({ id: "r2", iteration: 1, exitCode: 0 }),
    ];

    const output = formatFailures(config, runs, shaMap);
    expect(output).toContain("No failures");
  });

  it("reports failure count and cell grouping", () => {
    const config = makeConfig({
      iterations: 5,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["v5.0.0-beta.1"] },
    });
    const shaMap = new Map([["v5.0.0-beta.1", "f9a0b1c"]]);
    const runs: RunMeta[] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(
        makeRun({
          id: `r${i}`,
          chrome: "120.0.6099.109",
          ref: "v5.0.0-beta.1",
          sha: "f9a0b1c",
          iteration: i,
          exitCode: i === 3 ? 1 : 0,
          durationMs: i === 3 ? 2455 : 4000,
        })
      );
    }

    const output = formatFailures(config, runs, shaMap);
    expect(output).toContain("1 failure");
    expect(output).toContain("1 cell");
    expect(output).toContain("Chrome 120");
    expect(output).toContain("v5.0.0-beta.1");
    expect(output).toContain("1 of 5 failed");
  });

  it("shows dot sequence with passes and failures", () => {
    const config = makeConfig({
      iterations: 5,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs: RunMeta[] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(
        makeRun({
          id: `r${i}`,
          iteration: i,
          exitCode: i === 3 ? 1 : 0,
        })
      );
    }

    const output = formatFailures(config, runs, shaMap);
    // ●●●✗● pattern
    expect(output).toContain("●●●✗●");
    expect(output).toContain("4/5 passed, 1 failed");
  });

  it("shows failed iteration details", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0, durationMs: 4000 }),
      makeRun({ id: "fail-1", iteration: 1, exitCode: 1, durationMs: 2455 }),
    ];

    const output = formatFailures(config, runs, shaMap);
    expect(output).toContain("#1");
    expect(output).toContain("exit:1");
    expect(output).toContain("2455ms");
    expect(output).toContain("run:fail-1");
  });

  it("deduplicates identical stderr", () => {
    const config = makeConfig({
      iterations: 3,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({ id: "r0", iteration: 0, exitCode: 0 }),
      makeRun({ id: "r1", iteration: 1, exitCode: 1, durationMs: 2891 }),
      makeRun({ id: "r2", iteration: 2, exitCode: 1, durationMs: 3102 }),
    ];

    const stderrMap = new Map([
      ["r1", "Error: Timed out\n    at bench.spec.ts:5:15"],
      ["r2", "Error: Timed out\n    at bench.spec.ts:5:15"],
    ]);

    const output = formatFailures(config, runs, shaMap, stderrMap);
    expect(output).toContain("both identical");
  });

  it("shows pattern when all failures share a ref", () => {
    const config = makeConfig({
      iterations: 5,
      chrome: { versions: ["120.0.6099.109", "122.0.6261.94"] },
      code: { repo: ".", refs: ["main", "v5.0.0-beta.1"] },
    });
    const shaMap = new Map([
      ["main", "e7f8a9b"],
      ["v5.0.0-beta.1", "f9a0b1c"],
    ]);

    const runs: RunMeta[] = [];
    // All pass for main
    for (const chrome of ["120.0.6099.109", "122.0.6261.94"]) {
      for (let i = 0; i < 5; i++) {
        runs.push(
          makeRun({
            id: `main-${chrome}-${i}`,
            chrome,
            ref: "main",
            sha: "e7f8a9b",
            iteration: i,
            exitCode: 0,
          })
        );
      }
    }
    // One failure each in v5.0.0-beta.1
    for (const chrome of ["120.0.6099.109", "122.0.6261.94"]) {
      for (let i = 0; i < 5; i++) {
        runs.push(
          makeRun({
            id: `beta-${chrome}-${i}`,
            chrome,
            ref: "v5.0.0-beta.1",
            sha: "f9a0b1c",
            iteration: i,
            exitCode: i === 3 ? 1 : 0,
          })
        );
      }
    }

    const output = formatFailures(config, runs, shaMap);
    expect(output).toContain("Pattern:");
    expect(output).toContain("v5.0.0-beta.1");
  });

  it("shows retry command", () => {
    const config = makeConfig({
      iterations: 5,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["v5.0.0-beta.1"] },
    });
    const shaMap = new Map([["v5.0.0-beta.1", "f9a0b1c"]]);
    const runs = [
      makeRun({
        id: "r0",
        chrome: "120.0.6099.109",
        ref: "v5.0.0-beta.1",
        sha: "f9a0b1c",
        iteration: 0,
        exitCode: 1,
      }),
    ];

    const output = formatFailures(config, runs, shaMap);
    expect(output).toContain("Retry:");
    expect(output).toContain("chrome-ranger run --refs v5.0.0-beta.1");
  });
});
