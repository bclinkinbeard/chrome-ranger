import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeRun, type RunContext } from "../src/runner.js";
import type { Config } from "../src/config.js";
import { loadRuns } from "../src/runs.js";
import type { RunMeta } from "../src/matrix.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

// Helper to create a test git repo with a simple script
function createTestRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-runner-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  execSync("git config commit.gpgsign false", { cwd: dir });

  // Create a test script that outputs env vars
  fs.writeFileSync(
    path.join(dir, "test-script.sh"),
    `#!/bin/bash
echo "CHROME_BIN=$CHROME_BIN"
echo "CHROME_VERSION=$CHROME_VERSION"
echo "CODE_REF=$CODE_REF"
echo "CODE_SHA=$CODE_SHA"
echo "CODE_DIR=$CODE_DIR"
echo "ITERATION=$ITERATION"
>&2 echo "stderr output"
`
  );
  fs.chmodSync(path.join(dir, "test-script.sh"), 0o755);

  // Create a failing script
  fs.writeFileSync(
    path.join(dir, "fail-script.sh"),
    `#!/bin/bash
echo "about to fail"
exit 1
`
  );
  fs.chmodSync(path.join(dir, "fail-script.sh"), 0o755);

  execSync("git add . && git commit -m 'initial'", { cwd: dir });
  return dir;
}

// Create a fake chrome binary (just a script that exits 0)
function createFakeChrome(cacheDir: string, version: string): string {
  const chromeDir = path.join(cacheDir, `chrome-${version}`);
  fs.mkdirSync(chromeDir, { recursive: true });
  const chromePath = path.join(chromeDir, "chrome");
  fs.writeFileSync(chromePath, "#!/bin/bash\nexit 0\n");
  fs.chmodSync(chromePath, 0o755);
  return chromePath;
}

function makeConfig(repoDir: string, overrides: Partial<Config> = {}): Config {
  return {
    command: "bash test-script.sh",
    iterations: 1,
    warmup: 0,
    workers: 1,
    chrome: { versions: ["120.0.6099.109"] },
    code: { repo: repoDir, refs: ["HEAD"] },
    ...overrides,
  };
}

function makeContext(
  config: Config,
  projectDir: string,
  fakeChromes: Map<string, string>,
  overrides: Partial<RunContext> = {}
): RunContext {
  return {
    config,
    projectDir,
    options: {},
    log: () => {},
    resolveChromeBin: async (version: string) => {
      const p = fakeChromes.get(version);
      if (!p) throw new Error(`No fake chrome for ${version}`);
      return p;
    },
    ...overrides,
  };
}

describe("Runner", () => {
  let repoDir: string;
  let projectDir: string;
  let chromeCache: string;
  let chromePath: string;
  let fakeChromes: Map<string, string>;

  beforeEach(() => {
    repoDir = createTestRepo();
    projectDir = repoDir; // Use repo as project dir
    chromeCache = fs.mkdtempSync(path.join(os.tmpdir(), "cr-chromecache-"));
    chromePath = createFakeChrome(chromeCache, "120.0.6099.109");
    fakeChromes = new Map([["120.0.6099.109", chromePath]]);
  });

  afterEach(() => {
    // Clean up worktrees
    try {
      execSync("git worktree prune", { cwd: repoDir });
    } catch {
      // ignore
    }
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(chromeCache, { recursive: true, force: true });
  });

  describe("happy path", () => {
    it("single version, single ref, 1 iteration → 1 run in runs.jsonl", async () => {
      const config = makeConfig(repoDir, {
        chrome: {
          versions: ["120.0.6099.109"],
          cache_dir: chromeCache,
        },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const jsonlPath = path.join(
        projectDir,
        ".chrome-ranger",
        "runs.jsonl"
      );
      const runs = loadRuns(jsonlPath);
      expect(runs).toHaveLength(1);
    });

    it("run has valid UUID id", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("run has valid ISO 8601 timestamp", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(new Date(runs[0].timestamp).toISOString()).toBe(
        runs[0].timestamp
      );
    });

    it("run has reasonable durationMs", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs[0].durationMs).toBeGreaterThan(0);
      expect(runs[0].durationMs).toBeLessThan(30000);
    });

    it("stdout and stderr captured to output files", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      const stdoutPath = path.join(
        projectDir,
        ".chrome-ranger",
        "output",
        `${runs[0].id}.stdout`
      );
      const stderrPath = path.join(
        projectDir,
        ".chrome-ranger",
        "output",
        `${runs[0].id}.stderr`
      );
      expect(fs.existsSync(stdoutPath)).toBe(true);
      expect(fs.existsSync(stderrPath)).toBe(true);

      const stdout = fs.readFileSync(stdoutPath, "utf-8");
      expect(stdout).toContain("CHROME_VERSION=120.0.6099.109");
      expect(stdout).toContain("ITERATION=0");

      const stderr = fs.readFileSync(stderrPath, "utf-8");
      expect(stderr).toContain("stderr output");
    });

    it("sets all env vars correctly", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      const stdoutPath = path.join(
        projectDir,
        ".chrome-ranger",
        "output",
        `${runs[0].id}.stdout`
      );
      const stdout = fs.readFileSync(stdoutPath, "utf-8");
      expect(stdout).toContain("CHROME_BIN=");
      expect(stdout).toContain("CHROME_VERSION=120.0.6099.109");
      expect(stdout).toContain("CODE_REF=HEAD");
      expect(stdout).toContain("CODE_SHA=");
      expect(stdout).toContain("CODE_DIR=");
      expect(stdout).toContain("ITERATION=0");
    });
  });

  describe("multiple iterations", () => {
    it("iterations: 3 → 3 entries in runs.jsonl", async () => {
      const config = makeConfig(repoDir, {
        iterations: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(3);
    });

    it("ITERATION values are 0, 1, 2", async () => {
      const config = makeConfig(repoDir, {
        iterations: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs.map((r) => r.iteration).sort()).toEqual([0, 1, 2]);
    });
  });

  describe("matrix execution", () => {
    it("2 chrome × 1 ref × 2 iterations → 4 entries", async () => {
      const chrome2Path = createFakeChrome(chromeCache, "121.0.6167.85");
      fakeChromes.set("121.0.6167.85", chrome2Path);
      const config = makeConfig(repoDir, {
        iterations: 2,
        chrome: {
          versions: ["120.0.6099.109", "121.0.6167.85"],
          cache_dir: chromeCache,
        },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(4);

      const chromeVersions = new Set(runs.map((r) => r.chrome));
      expect(chromeVersions.size).toBe(2);
    });
  });

  describe("setup command", () => {
    it("runs setup once per worktree, not per iteration", async () => {
      // Create a setup script that writes a counter file
      const counterFile = path.join(repoDir, "setup-counter");
      fs.writeFileSync(
        path.join(repoDir, "setup.sh"),
        `#!/bin/bash
if [ -f "${counterFile}" ]; then
  count=$(cat "${counterFile}")
  echo $((count + 1)) > "${counterFile}"
else
  echo 1 > "${counterFile}"
fi
`
      );
      fs.chmodSync(path.join(repoDir, "setup.sh"), 0o755);
      execSync("git add . && git commit -m 'add setup'", { cwd: repoDir });

      const config = makeConfig(repoDir, {
        setup: "bash setup.sh",
        iterations: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(3);
    });

    it("setup failure → ref skipped, no iterations for that ref", async () => {
      const config = makeConfig(repoDir, {
        setup: "exit 1",
        iterations: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(0);
    });
  });

  describe("warmup", () => {
    it("warmup iterations NOT written to runs.jsonl", async () => {
      const config = makeConfig(repoDir, {
        warmup: 2,
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
    });

    it("warmup iterations NOT written to output directory", async () => {
      const config = makeConfig(repoDir, {
        warmup: 2,
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const outputDir = path.join(projectDir, ".chrome-ranger", "output");
      const files = fs.readdirSync(outputDir);
      // Only 1 iteration * 2 files (stdout + stderr) = 2 files
      expect(files).toHaveLength(2);
    });

    it("warmup: 0 → no warmup, iterations start immediately", async () => {
      const config = makeConfig(repoDir, {
        warmup: 0,
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
    });

    it("warmup failure → cell skipped", async () => {
      // Create a script that fails during warmup
      fs.writeFileSync(
        path.join(repoDir, "warmup-fail.sh"),
        `#!/bin/bash
exit 1
`
      );
      fs.chmodSync(path.join(repoDir, "warmup-fail.sh"), 0o755);
      execSync("git add . && git commit -m 'add warmup-fail'", {
        cwd: repoDir,
      });

      const config = makeConfig(repoDir, {
        command: "bash warmup-fail.sh",
        warmup: 1,
        iterations: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(0);
    });
  });

  describe("failure handling", () => {
    it("failed run recorded with exitCode in runs.jsonl", async () => {
      const config = makeConfig(repoDir, {
        command: "bash fail-script.sh",
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].exitCode).not.toBe(0);
    });

    it("stdout/stderr still captured for failed runs", async () => {
      const config = makeConfig(repoDir, {
        command: "bash fail-script.sh",
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      const stdoutPath = path.join(
        projectDir,
        ".chrome-ranger",
        "output",
        `${runs[0].id}.stdout`
      );
      expect(fs.existsSync(stdoutPath)).toBe(true);
      const stdout = fs.readFileSync(stdoutPath, "utf-8");
      expect(stdout).toContain("about to fail");
    });
  });

  describe("resumability", () => {
    it("second run does nothing when all cells complete", async () => {
      const config = makeConfig(repoDir, {
        iterations: 2,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      let runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);

      // Run again — should add nothing
      await executeRun(ctx);
      runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);
    });

    it("resumes failed cells on second run", async () => {
      // First run with failing command
      const failConfig = makeConfig(repoDir, {
        command: "bash fail-script.sh",
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      await executeRun(makeContext(failConfig, projectDir, fakeChromes));

      let runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].exitCode).not.toBe(0);

      // Second run with succeeding command
      const successConfig = makeConfig(repoDir, {
        command: "bash test-script.sh",
        iterations: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      await executeRun(makeContext(successConfig, projectDir, fakeChromes));

      runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      // Should have 2 entries — the failed one + the new successful one
      expect(runs).toHaveLength(2);
      expect(runs.some((r) => r.exitCode === 0)).toBe(true);
    });
  });

  describe("workers / parallelism", () => {
    it("workers: 1 → runs serially (all runs complete)", async () => {
      const config = makeConfig(repoDir, {
        iterations: 3,
        workers: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(3);
    });

    it("workers: 2 → all runs complete", async () => {
      const config = makeConfig(repoDir, {
        iterations: 4,
        workers: 2,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(4);
    });

    it("runs.jsonl entries are valid JSON under concurrent writes", async () => {
      const config = makeConfig(repoDir, {
        iterations: 6,
        workers: 3,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(projectDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(6);
      // Each run should parse correctly
      for (const run of runs) {
        expect(run.id).toBeTruthy();
        expect(run.chrome).toBe("120.0.6099.109");
        expect(typeof run.durationMs).toBe("number");
      }
    });
  });

  describe("lockfile", () => {
    it("lockfile created during run", async () => {
      const config = makeConfig(repoDir, {
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
      });
      const ctx = makeContext(config, projectDir, fakeChromes);
      await executeRun(ctx);

      // After run, lock should be released
      const lockPath = path.join(projectDir, ".chrome-ranger", "lock");
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
