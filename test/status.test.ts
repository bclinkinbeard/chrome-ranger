import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureRepo, writeConfig, STUB_CHROME_BIN } from "./helpers.js";
import { statusCommand } from "../src/commands/status.js";
import { appendRun } from "../src/runs.js";
import { runsJsonlPath } from "../src/storage.js";
import type { RunMeta } from "../src/types.js";

const TMP = resolve(import.meta.dirname, ".tmp-status-test");
let fixture: ReturnType<typeof createFixtureRepo>;
let stderrOutput: string;

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  fixture = createFixtureRepo(TMP);
  process.exitCode = undefined;

  // Capture stderr output
  stderrOutput = "";
  const origWrite = process.stderr.write.bind(process.stderr);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
    stderrOutput += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fixture.cleanup();
  rmSync(TMP, { recursive: true, force: true });
  process.exitCode = undefined;
});

function makeMeta(
  chrome: string,
  sha: string,
  overrides?: Partial<RunMeta>,
): RunMeta {
  return {
    id: "test-" + Math.random().toString(36).slice(2),
    chrome,
    ref: "main",
    sha,
    iteration: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    exitCode: 0,
    ...overrides,
  };
}

describe("status command", () => {
  it("shows 0/N for cells with no runs", () => {
    writeConfig(fixture.repoDir, {
      iterations: 5,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });

    statusCommand(fixture.repoDir);

    expect(stderrOutput).toContain("0/5");
    expect(stderrOutput).toContain("Chrome 120.0.6099.109");
  });

  it("shows N/M with checkmark for complete cells", () => {
    writeConfig(fixture.repoDir, {
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    const runsPath = runsJsonlPath(fixture.repoDir);
    appendRun(
      runsPath,
      makeMeta("v1", fixture.mainSha, { iteration: 0 }),
    );
    appendRun(
      runsPath,
      makeMeta("v1", fixture.mainSha, { iteration: 1 }),
    );

    statusCommand(fixture.repoDir);

    expect(stderrOutput).toContain("2/2");
    expect(stderrOutput).toContain("\u2713");
  });

  it("shows failures for cells with non-zero exit codes", () => {
    writeConfig(fixture.repoDir, {
      iterations: 3,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    const runsPath = runsJsonlPath(fixture.repoDir);
    appendRun(
      runsPath,
      makeMeta("v1", fixture.mainSha, { iteration: 0, exitCode: 0 }),
    );
    appendRun(
      runsPath,
      makeMeta("v1", fixture.mainSha, { iteration: 1, exitCode: 1 }),
    );

    statusCommand(fixture.repoDir);

    expect(stderrOutput).toContain("1/3");
    expect(stderrOutput).toContain("1 failed");
  });

  it("shows matrix with multiple Chrome versions and refs", () => {
    writeConfig(fixture.repoDir, {
      iterations: 1,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main", "feature"] },
    });

    statusCommand(fixture.repoDir);

    expect(stderrOutput).toContain("Chrome v1");
    expect(stderrOutput).toContain("Chrome v2");
    expect(stderrOutput).toContain("main");
    expect(stderrOutput).toContain("feature");
  });

  it("handles no runs.jsonl file gracefully", () => {
    writeConfig(fixture.repoDir, {
      iterations: 3,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    // Don't create runs.jsonl
    statusCommand(fixture.repoDir);

    expect(stderrOutput).toContain("0/3");
  });
});
