import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeRun, type RunContext } from "../src/runner.js";
import type { Config } from "../src/config.js";
import { loadRuns } from "../src/runs.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

function createTestRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-flags-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  execSync("git config commit.gpgsign false", { cwd: dir });

  fs.writeFileSync(
    path.join(dir, "test-script.sh"),
    `#!/bin/bash
echo "CHROME_VERSION=$CHROME_VERSION CODE_REF=$CODE_REF ITERATION=$ITERATION"
`
  );
  fs.chmodSync(path.join(dir, "test-script.sh"), 0o755);
  execSync("git add . && git commit -m 'initial'", { cwd: dir });

  // Create a second branch
  execSync("git branch v2", { cwd: dir });

  return dir;
}

function createFakeChrome(cacheDir: string, version: string): string {
  const chromeDir = path.join(cacheDir, `chrome-${version}`);
  fs.mkdirSync(chromeDir, { recursive: true });
  const chromePath = path.join(chromeDir, "chrome");
  fs.writeFileSync(chromePath, "#!/bin/bash\nexit 0\n");
  fs.chmodSync(chromePath, 0o755);
  return chromePath;
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

describe("CLI Flags", () => {
  let repoDir: string;
  let chromeCache: string;
  let fakeChromes: Map<string, string>;

  beforeEach(() => {
    repoDir = createTestRepo();
    chromeCache = fs.mkdtempSync(path.join(os.tmpdir(), "cr-chromecache-"));
    const p1 = createFakeChrome(chromeCache, "120.0.6099.109");
    const p2 = createFakeChrome(chromeCache, "121.0.6167.85");
    fakeChromes = new Map([
      ["120.0.6099.109", p1],
      ["121.0.6167.85", p2],
    ]);
  });

  afterEach(() => {
    try {
      execSync("git worktree prune", { cwd: repoDir });
    } catch {
      // ignore
    }
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(chromeCache, { recursive: true, force: true });
  });

  describe("--chrome filter", () => {
    it("only runs cells for specified Chrome version", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 1,
        warmup: 0,
        workers: 1,
        chrome: {
          versions: ["120.0.6099.109", "121.0.6167.85"],
          cache_dir: chromeCache,
        },
        code: { repo: repoDir, refs: ["HEAD"] },
      };
      const ctx = makeContext(config, repoDir, fakeChromes, {
        options: { chrome: ["120.0.6099.109"] },
      });
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].chrome).toBe("120.0.6099.109");
    });
  });

  describe("--refs filter", () => {
    it("only runs cells for specified ref", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 1,
        warmup: 0,
        workers: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
        code: { repo: repoDir, refs: ["HEAD", "v2"] },
      };
      const ctx = makeContext(config, repoDir, fakeChromes, {
        options: { refs: ["HEAD"] },
      });
      await executeRun(ctx);

      const runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].ref).toBe("HEAD");
    });
  });

  describe("--append N", () => {
    it("adds N additional runs beyond iterations", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 2,
        warmup: 0,
        workers: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
        code: { repo: repoDir, refs: ["HEAD"] },
      };

      // First: fill to minimum
      const ctx1 = makeContext(config, repoDir, fakeChromes);
      await executeRun(ctx1);

      let runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);

      // Then: append 3 more
      const ctx2 = makeContext(config, repoDir, fakeChromes, {
        options: { append: 3 },
      });
      await executeRun(ctx2);

      runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(5);

      // Iteration numbering continues from last
      const iterations = runs.map((r) => r.iteration).sort((a, b) => a - b);
      expect(iterations).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe("--replace", () => {
    it("clears and re-runs targeted cells", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 2,
        warmup: 0,
        workers: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
        code: { repo: repoDir, refs: ["HEAD"] },
      };

      // First run
      const ctx1 = makeContext(config, repoDir, fakeChromes);
      await executeRun(ctx1);

      let runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);
      const oldIds = runs.map((r) => r.id);

      // Replace
      const ctx2 = makeContext(config, repoDir, fakeChromes, {
        options: { replace: true },
      });
      await executeRun(ctx2);

      runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);
      // New IDs should be different
      const newIds = runs.map((r) => r.id);
      expect(newIds).not.toEqual(oldIds);
    });

    it("deletes output files for replaced runs", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 1,
        warmup: 0,
        workers: 1,
        chrome: { versions: ["120.0.6099.109"], cache_dir: chromeCache },
        code: { repo: repoDir, refs: ["HEAD"] },
      };

      // First run
      const ctx1 = makeContext(config, repoDir, fakeChromes);
      await executeRun(ctx1);

      let runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      const oldId = runs[0].id;
      const oldStdout = path.join(
        repoDir,
        ".chrome-ranger",
        "output",
        `${oldId}.stdout`
      );
      expect(fs.existsSync(oldStdout)).toBe(true);

      // Replace
      const ctx2 = makeContext(config, repoDir, fakeChromes, {
        options: { replace: true },
      });
      await executeRun(ctx2);

      // Old output files should be gone
      expect(fs.existsSync(oldStdout)).toBe(false);
    });

    it("with --chrome filter only clears targeted cells", async () => {
      const config: Config = {
        command: "bash test-script.sh",
        iterations: 1,
        warmup: 0,
        workers: 1,
        chrome: {
          versions: ["120.0.6099.109", "121.0.6167.85"],
          cache_dir: chromeCache,
        },
        code: { repo: repoDir, refs: ["HEAD"] },
      };

      // First run all
      const ctx1 = makeContext(config, repoDir, fakeChromes);
      await executeRun(ctx1);

      let runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      expect(runs).toHaveLength(2);

      const chrome121Run = runs.find((r) => r.chrome === "121.0.6167.85");

      // Replace only chrome 120
      const ctx2 = makeContext(config, repoDir, fakeChromes, {
        options: { replace: true, chrome: ["120.0.6099.109"] },
      });
      await executeRun(ctx2);

      runs = loadRuns(
        path.join(repoDir, ".chrome-ranger", "runs.jsonl")
      );
      // Should have 2: the untouched chrome 121 run + the new chrome 120 run
      expect(runs).toHaveLength(2);
      // Chrome 121 run should still be there with same ID
      const kept = runs.find((r) => r.chrome === "121.0.6167.85");
      expect(kept?.id).toBe(chrome121Run?.id);
    });
  });
});
