import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureRepo, writeConfig, STUB_CHROME_BIN } from "./helpers.js";
import { runCommand } from "../src/commands/run.js";
import { loadRuns } from "../src/runs.js";
import { runsJsonlPath, outputDir } from "../src/storage.js";
import type { RunMeta } from "../src/types.js";

// Mock ensureChrome to avoid real downloads
vi.mock("../src/chrome.js", () => ({
  ensureChrome: vi.fn(async () => STUB_CHROME_BIN),
  listChromeVersions: vi.fn(async () => []),
  cleanChromeCache: vi.fn(async () => {}),
}));

const TMP = resolve(import.meta.dirname, ".tmp-integration-test");

let fixture: ReturnType<typeof createFixtureRepo>;

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  fixture = createFixtureRepo(TMP);
  process.exitCode = undefined;
});

afterEach(() => {
  fixture.cleanup();
  rmSync(TMP, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("run command — happy path", () => {
  it("executes single cell and produces runs.jsonl + output files", async () => {
    writeConfig(fixture.repoDir, {
      command: 'echo "hello stdout" && echo "hello stderr" >&2',
      iterations: 1,
      chrome: { versions: ["test-chrome-version"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runsPath = runsJsonlPath(fixture.repoDir);
    const runs = loadRuns(runsPath);
    expect(runs).toHaveLength(1);

    const run = runs[0];

    // Verify RunMeta schema (TEST_PLAN 10.1)
    expect(run.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(run.chrome).toBe("test-chrome-version");
    expect(run.ref).toBe("main");
    expect(run.sha).toBe(fixture.mainSha);
    expect(run.iteration).toBe(0);
    expect(new Date(run.timestamp).toISOString()).toBe(run.timestamp);
    expect(run.durationMs).toBeGreaterThan(0);
    expect(run.exitCode).toBe(0);

    // Verify output files exist (TEST_PLAN 9.1)
    const outDir = outputDir(fixture.repoDir);
    const stdoutContent = readFileSync(resolve(outDir, `${run.id}.stdout`), "utf-8");
    const stderrContent = readFileSync(resolve(outDir, `${run.id}.stderr`), "utf-8");
    expect(stdoutContent.trim()).toBe("hello stdout");
    expect(stderrContent.trim()).toBe("hello stderr");
  });

  it("verifies all env vars are set correctly", async () => {
    writeConfig(fixture.repoDir, {
      command:
        'echo "CHROME_BIN=$CHROME_BIN CHROME_VERSION=$CHROME_VERSION CODE_REF=$CODE_REF CODE_SHA=$CODE_SHA CODE_DIR=$CODE_DIR ITERATION=$ITERATION"',
      iterations: 1,
      chrome: { versions: ["120.0.6099.109"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(1);

    const outDir = outputDir(fixture.repoDir);
    const stdout = readFileSync(resolve(outDir, `${runs[0].id}.stdout`), "utf-8");

    expect(stdout).toContain(`CHROME_BIN=${STUB_CHROME_BIN}`);
    expect(stdout).toContain("CHROME_VERSION=120.0.6099.109");
    expect(stdout).toContain("CODE_REF=main");
    expect(stdout).toContain(`CODE_SHA=${fixture.mainSha}`);
    expect(stdout).toContain("CODE_DIR=");
    expect(stdout).toContain("ITERATION=0");
  });
});

describe("run command — multiple iterations", () => {
  it("iterations: 3 produces 3 entries with correct iteration numbers", async () => {
    writeConfig(fixture.repoDir, {
      command: 'echo "iter $ITERATION"',
      iterations: 3,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.iteration).sort()).toEqual([0, 1, 2]);
  });
});

describe("run command — matrix execution", () => {
  it("2 chrome × 2 refs × 2 iterations = 8 entries", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main", "feature"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(8);

    // Each (chrome, ref) combo should have 2 entries
    const combos = new Map<string, number>();
    for (const r of runs) {
      const key = `${r.chrome}::${r.ref}`;
      combos.set(key, (combos.get(key) ?? 0) + 1);
    }
    expect(combos.get("v1::main")).toBe(2);
    expect(combos.get("v1::feature")).toBe(2);
    expect(combos.get("v2::main")).toBe(2);
    expect(combos.get("v2::feature")).toBe(2);
  });
});

describe("run command — worktree management", () => {
  it("creates worktrees for each ref", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      code: { repo: ".", refs: ["main", "feature"] },
    });

    await runCommand(fixture.repoDir, {});

    const wtDir = resolve(fixture.repoDir, ".chrome-ranger", "worktrees");
    expect(existsSync(resolve(wtDir, "main"))).toBe(true);
    expect(existsSync(resolve(wtDir, "feature"))).toBe(true);
  });

  it("reuses existing worktrees on second run", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    // Second run should not throw
    await runCommand(fixture.repoDir, { append: 1 });

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(2);
  });
});

describe("run command — setup", () => {
  it("runs setup once per worktree", async () => {
    writeConfig(fixture.repoDir, {
      command: "cat setup-marker.txt",
      setup: "echo setup-ran > setup-marker.txt",
      iterations: 2,
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(2);
    // Both iterations should succeed (setup ran once, file exists for both)
    expect(runs.every((r) => r.exitCode === 0)).toBe(true);
  });

  it("skips setup if already done for same SHA", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      setup: "echo ran-setup",
      iterations: 1,
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    // Second run — setup should not re-run because SHA hasn't changed
    await runCommand(fixture.repoDir, { append: 1 });

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(2);
  });

  it("setup failure skips ref but other refs continue", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      setup: 'if grep -q "feature change" file.txt 2>/dev/null; then exit 1; fi; echo ok',
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main", "feature"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    // Only main should have runs, feature was skipped due to setup failure
    expect(runs.length).toBe(1);
    expect(runs[0].ref).toBe("main");
  });
});

describe("run command — warmup", () => {
  it("warmup iterations are not written to runs.jsonl", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      warmup: 2,
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    // Only 1 real iteration, warmup should not be recorded
    expect(runs).toHaveLength(1);
  });

  it("warmup iterations are not written to output directory", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      warmup: 2,
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const outDir = outputDir(fixture.repoDir);
    const files = existsSync(outDir) ? readdirSync(outDir) : [];
    // 1 real iteration = 1 stdout + 1 stderr = 2 files
    expect(files).toHaveLength(2);
  });

  it("warmup failure skips that cell", async () => {
    // Command fails for v2 but succeeds for v1
    writeConfig(fixture.repoDir, {
      command:
        'if [ "$CHROME_VERSION" = "v2" ]; then exit 1; fi; echo ok',
      warmup: 1,
      iterations: 1,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    // v2 cell skipped due to warmup failure, only v1 should have runs
    expect(runs).toHaveLength(1);
    expect(runs[0].chrome).toBe("v1");
  });

  it("warmup: 0 starts iterations immediately", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      warmup: 0,
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(2);
  });
});

describe("run command — failure handling", () => {
  it("failed command records non-zero exitCode", async () => {
    writeConfig(fixture.repoDir, {
      command: "exit 42",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(1);
    expect(runs[0].exitCode).toBe(42);
  });

  it("captures stdout/stderr for failed runs", async () => {
    writeConfig(fixture.repoDir, {
      command: 'echo "fail-out" && echo "fail-err" >&2 && exit 1',
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    const outDir = outputDir(fixture.repoDir);
    const stdout = readFileSync(resolve(outDir, `${runs[0].id}.stdout`), "utf-8");
    const stderr = readFileSync(resolve(outDir, `${runs[0].id}.stderr`), "utf-8");
    expect(stdout.trim()).toBe("fail-out");
    expect(stderr.trim()).toBe("fail-err");
  });

  it("failed run does not abort other cells", async () => {
    writeConfig(fixture.repoDir, {
      command:
        'if [ "$CHROME_VERSION" = "v1" ] && [ "$ITERATION" = "0" ]; then exit 1; fi; echo ok',
      iterations: 2,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    // All 4 runs should still execute (1 fails, 3 succeed)
    expect(runs).toHaveLength(4);
    const failed = runs.filter((r) => r.exitCode !== 0);
    expect(failed).toHaveLength(1);
  });
});

describe("run command — resumability", () => {
  it("second run skips completed cells", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const firstRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(firstRuns).toHaveLength(2);

    // Second run — nothing to do
    await runCommand(fixture.repoDir, {});
    const secondRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    // No new runs added
    expect(secondRuns).toHaveLength(2);
  });

  it("second run retries only failed cells", async () => {
    // First run: iteration 0 succeeds, iteration 1 fails
    writeConfig(fixture.repoDir, {
      command:
        'if [ "$ITERATION" = "1" ]; then exit 1; fi; echo ok',
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const firstRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(firstRuns).toHaveLength(2);
    expect(firstRuns.filter((r) => r.exitCode === 0)).toHaveLength(1);

    // Fix the command for second run so iteration 1 succeeds
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const allRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    // Original 2 + 1 retry = 3
    expect(allRuns).toHaveLength(3);
    // At least 2 successful now
    expect(allRuns.filter((r) => r.exitCode === 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe("run command — workers", () => {
  it("workers: 2 produces valid non-interleaved runs.jsonl", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 4,
      workers: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(4);

    // Verify each line is valid JSON (loadRuns would throw if not)
    // Verify unique IDs
    const ids = runs.map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe("run command — --chrome filter", () => {
  it("only runs cells for filtered Chrome version", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, { chrome: ["v1"] });

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(1);
    expect(runs[0].chrome).toBe("v1");
  });
});

describe("run command — --refs filter", () => {
  it("only runs cells for filtered ref", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main", "feature"] },
    });

    await runCommand(fixture.repoDir, { refs: ["main"] });

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(runs).toHaveLength(1);
    expect(runs[0].ref).toBe("main");
  });
});

describe("run command — --append", () => {
  it("adds N runs beyond configured iterations", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    // Fill the base iterations first
    await runCommand(fixture.repoDir, {});
    expect(loadRuns(runsJsonlPath(fixture.repoDir))).toHaveLength(2);

    // Append 3 more
    await runCommand(fixture.repoDir, { append: 3 });
    const allRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(allRuns).toHaveLength(5);

    // Appended iterations should start at index 2
    const appended = allRuns.slice(2);
    expect(appended.map((r) => r.iteration).sort()).toEqual([2, 3, 4]);
  });
});

describe("run command — --replace", () => {
  it("clears existing runs and re-runs from scratch", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const firstRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(firstRuns).toHaveLength(2);
    const firstIds = firstRuns.map((r) => r.id);

    // Replace
    await runCommand(fixture.repoDir, { replace: true });
    const newRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    expect(newRuns).toHaveLength(2);

    // IDs should be different (re-run, not reuse)
    const newIds = newRuns.map((r) => r.id);
    expect(newIds).not.toEqual(firstIds);
  });

  it("--replace with --chrome filter only clears targeted cells", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      chrome: { versions: ["v1", "v2"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    expect(loadRuns(runsJsonlPath(fixture.repoDir))).toHaveLength(2);

    const v2Run = loadRuns(runsJsonlPath(fixture.repoDir)).find(
      (r) => r.chrome === "v2",
    )!;

    // Replace only v1
    await runCommand(fixture.repoDir, {
      replace: true,
      chrome: ["v1"],
    });

    const allRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    // v2 original should still be there + new v1
    expect(allRuns).toHaveLength(2);
    const v2After = allRuns.find((r) => r.chrome === "v2");
    expect(v2After?.id).toBe(v2Run.id); // unchanged
  });

  it("--replace deletes output files for cleared runs", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const firstRuns = loadRuns(runsJsonlPath(fixture.repoDir));
    const oldId = firstRuns[0].id;
    const outDir = outputDir(fixture.repoDir);
    expect(existsSync(resolve(outDir, `${oldId}.stdout`))).toBe(true);

    // Replace
    await runCommand(fixture.repoDir, { replace: true });

    // Old output files should be gone
    expect(existsSync(resolve(outDir, `${oldId}.stdout`))).toBe(false);
    expect(existsSync(resolve(outDir, `${oldId}.stderr`))).toBe(false);
  });
});

describe("run command — output integrity", () => {
  it("every runs.jsonl entry has corresponding output files", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 3,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    const outDir = outputDir(fixture.repoDir);
    for (const run of runs) {
      expect(existsSync(resolve(outDir, `${run.id}.stdout`))).toBe(true);
      expect(existsSync(resolve(outDir, `${run.id}.stderr`))).toBe(true);
    }
  });

  it("no orphaned output files", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 2,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    const outDir = outputDir(fixture.repoDir);
    const files = readdirSync(outDir);
    const runIds = new Set(runs.map((r) => r.id));

    for (const file of files) {
      const id = file.replace(/\.(stdout|stderr)$/, "");
      expect(runIds.has(id)).toBe(true);
    }
  });

  it("empty stdout/stderr produces empty files, not missing files", async () => {
    writeConfig(fixture.repoDir, {
      command: "exit 0",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    const outDir = outputDir(fixture.repoDir);
    expect(existsSync(resolve(outDir, `${runs[0].id}.stdout`))).toBe(true);
    expect(existsSync(resolve(outDir, `${runs[0].id}.stderr`))).toBe(true);

    const stdout = readFileSync(resolve(outDir, `${runs[0].id}.stdout`), "utf-8");
    expect(stdout).toBe("");
  });

  it("multi-line output preserved exactly", async () => {
    writeConfig(fixture.repoDir, {
      command: 'printf "line1\\nline2\\nline3"',
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});

    const runs = loadRuns(runsJsonlPath(fixture.repoDir));
    const outDir = outputDir(fixture.repoDir);
    const stdout = readFileSync(resolve(outDir, `${runs[0].id}.stdout`), "utf-8");
    expect(stdout).toBe("line1\nline2\nline3");
  });
});

describe("run command — lockfile behavior", () => {
  it("lockfile is released after successful run", async () => {
    writeConfig(fixture.repoDir, {
      command: "echo ok",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const lockPath = resolve(fixture.repoDir, ".chrome-ranger", "lock");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("lockfile is released after failed run", async () => {
    writeConfig(fixture.repoDir, {
      command: "exit 1",
      iterations: 1,
      chrome: { versions: ["v1"] },
      code: { repo: ".", refs: ["main"] },
    });

    await runCommand(fixture.repoDir, {});
    const lockPath = resolve(fixture.repoDir, ".chrome-ranger", "lock");
    expect(existsSync(lockPath)).toBe(false);
  });
});
