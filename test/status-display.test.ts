import { describe, it, expect } from "vitest";
import { formatStatusBars, formatStatusCompact } from "../src/status-display.js";
import type { Config } from "../src/config.js";
import type { RunMeta } from "../src/matrix.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    command: "echo test",
    iterations: 5,
    warmup: 0,
    workers: 1,
    chrome: { versions: ["120.0.6099.109", "121.0.6167.85", "122.0.6261.94"] },
    code: { repo: ".", refs: ["main", "v4.5.0", "v5.0.0-beta.1"] },
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

function generateRuns(
  chrome: string,
  ref: string,
  sha: string,
  count: number,
  failAt: number[] = []
): RunMeta[] {
  const runs: RunMeta[] = [];
  for (let i = 0; i < count; i++) {
    runs.push(
      makeRun({
        id: `${chrome}-${ref}-${i}`,
        chrome,
        ref,
        sha,
        iteration: i,
        exitCode: failAt.includes(i) ? 1 : 0,
      })
    );
  }
  return runs;
}

describe("formatStatusBars", () => {
  it("renders bar + fraction format for each cell", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5);

    const output = formatStatusBars(config, runs, shaMap);
    expect(output).toContain("█████");
    expect(output).toContain("✓");
    expect(output).toContain("chrome@120");
    expect(output).toContain("main");
  });

  it("shows empty bars for no runs", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);

    const output = formatStatusBars(config, [], shaMap);
    expect(output).toContain("░░░░░");
    expect(output).toContain("0/5");
  });

  it("shows partial progress", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 3);

    const output = formatStatusBars(config, runs, shaMap);
    expect(output).toContain("███░░");
    expect(output).toContain("3/5");
  });

  it("shows failure markers in bars", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5, [3]);

    const output = formatStatusBars(config, runs, shaMap);
    expect(output).toContain("███✗█");
    expect(output).toContain("4/5");
    expect(output).toContain("✗1");
  });

  it("shows summary line with completion count", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5);

    const output = formatStatusBars(config, runs, shaMap);
    expect(output).toContain("5/5 complete");
  });

  it("shows 'No runs recorded' for empty state", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);

    const output = formatStatusBars(config, [], shaMap);
    expect(output).toContain("No runs recorded");
  });

  it("shows failure summary when failures exist", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5, [2, 4]);

    const output = formatStatusBars(config, runs, shaMap);
    expect(output).toContain("failed");
  });

  it("renders multiple chrome versions as rows", () => {
    const config = makeConfig();
    const shaMap = new Map([
      ["main", "e7f8a9b"],
      ["v4.5.0", "c3d4e5f"],
      ["v5.0.0-beta.1", "f9a0b1c"],
    ]);

    const output = formatStatusBars(config, [], shaMap);
    expect(output).toContain("chrome@120");
    expect(output).toContain("chrome@121");
    expect(output).toContain("chrome@122");
  });
});

describe("formatStatusCompact (heat map)", () => {
  it("renders single character per cell", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5);

    const output = formatStatusCompact(config, runs, shaMap);
    expect(output).toContain("█");
    expect(output).toContain("chrome@120");
    expect(output).toContain("main");
  });

  it("shows ✗ for cells with failures", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5, [3]);

    const output = formatStatusCompact(config, runs, shaMap);
    expect(output).toContain("✗");
  });

  it("shows ░ for not-started cells", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);

    const output = formatStatusCompact(config, [], shaMap);
    expect(output).toContain("░");
  });

  it("shows ▓ for >50% complete", () => {
    const config = makeConfig({
      iterations: 10,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 6);

    const output = formatStatusCompact(config, runs, shaMap);
    expect(output).toContain("▓");
  });

  it("shows ▒ for started but <=50%", () => {
    const config = makeConfig({
      iterations: 10,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 2);

    const output = formatStatusCompact(config, runs, shaMap);
    expect(output).toContain("▒");
  });

  it("includes legend at bottom", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);

    const output = formatStatusCompact(config, [], shaMap);
    expect(output).toContain("█ complete");
    expect(output).toContain("░ empty");
  });

  it("shows completion summary", () => {
    const config = makeConfig({
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });
    const shaMap = new Map([["main", "e7f8a9b"]]);
    const runs = generateRuns("120.0.6099.109", "main", "e7f8a9b", 5);

    const output = formatStatusCompact(config, runs, shaMap);
    expect(output).toContain("5/5 complete");
  });
});
