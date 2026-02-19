import { describe, it, expect } from "vitest";
import { formatStatus } from "../src/status.js";
import type { Config } from "../src/config.js";
import type { RunMeta } from "../src/matrix.js";

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

describe("Status", () => {
  it("shows full matrix with completion counts", () => {
    const config = makeConfig({ iterations: 5 });
    const shaMap = new Map([
      ["main", "e7f8a9b"],
      ["v4.5.0", "c3d4e5f"],
    ]);

    const runs: RunMeta[] = [];
    // 5 successful runs for chrome 120 × main
    for (let i = 0; i < 5; i++) {
      runs.push(
        makeRun({
          id: `r-120-main-${i}`,
          chrome: "120.0.6099.109",
          ref: "main",
          sha: "e7f8a9b",
          iteration: i,
          exitCode: 0,
        })
      );
    }
    // 3 successful for chrome 121 × main
    for (let i = 0; i < 3; i++) {
      runs.push(
        makeRun({
          id: `r-121-main-${i}`,
          chrome: "121.0.6167.85",
          ref: "main",
          sha: "e7f8a9b",
          iteration: i,
          exitCode: 0,
        })
      );
    }

    const output = formatStatus(config, runs, shaMap);
    expect(output).toContain("main");
    expect(output).toContain("v4.5.0");
    expect(output).toContain("120");
    expect(output).toContain("121");
    // Chrome 120 × main = 5/5
    expect(output).toContain("5/5");
    // Chrome 121 × main = 3/5
    expect(output).toContain("3/5");
    // Cells with no runs = 0/5
    expect(output).toContain("0/5");
  });

  it("shows 0/N for all cells when no runs exist", () => {
    const config = makeConfig({ iterations: 3 });
    const shaMap = new Map([
      ["main", "e7f8a9b"],
      ["v4.5.0", "c3d4e5f"],
    ]);

    const output = formatStatus(config, [], shaMap);
    expect(output).toContain("0/3");
  });

  it("shows checkmark for complete cells", () => {
    const config = makeConfig({
      iterations: 1,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        exitCode: 0,
      }),
    ];

    const output = formatStatus(config, runs, shaMap);
    expect(output).toContain("✓");
  });

  it("shows failure indicator for cells with only failed runs", () => {
    const config = makeConfig({
      iterations: 2,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = [
      makeRun({
        id: "r1",
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 0,
        exitCode: 0,
      }),
      makeRun({
        id: "r2",
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "e7f8a9b",
        iteration: 1,
        exitCode: 1,
      }),
    ];

    const output = formatStatus(config, runs, shaMap);
    expect(output).toContain("1/2");
    expect(output).toContain("failed");
  });

  it("does not count runs from old SHA", () => {
    const config = makeConfig({
      iterations: 1,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "new5678"]]);
    const runs = [
      makeRun({
        chrome: "120.0.6099.109",
        ref: "main",
        sha: "old1234",
        iteration: 0,
        exitCode: 0,
      }),
    ];

    const output = formatStatus(config, runs, shaMap);
    expect(output).toContain("0/1");
  });
});
