import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

/**
 * Creates a temporary git repo with two branches and tags for integration tests.
 * Returns the repo path, branch SHAs, and a cleanup function.
 */
export function createFixtureRepo(baseDir: string): {
  repoDir: string;
  mainSha: string;
  featureSha: string;
  cleanup: () => void;
} {
  const repoDir = resolve(baseDir, "repo");
  mkdirSync(repoDir, { recursive: true });

  const git = (cmd: string) =>
    execSync(cmd, {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });

  git("git init -b main");
  writeFileSync(resolve(repoDir, "file.txt"), "initial\n");
  git("git add .");
  git('git commit -m "initial commit"');
  const mainSha = git("git rev-parse HEAD").trim();

  git("git checkout -b feature");
  writeFileSync(resolve(repoDir, "file.txt"), "feature change\n");
  git("git add .");
  git('git commit -m "feature commit"');
  const featureSha = git("git rev-parse HEAD").trim();

  // Go back to main
  git("git checkout main");

  return {
    repoDir,
    mainSha,
    featureSha,
    cleanup: () => {
      // Clean up any worktrees first
      try {
        git("git worktree prune");
      } catch {
        // ignore
      }
      rmSync(repoDir, { recursive: true, force: true });
    },
  };
}

/**
 * Writes a chrome-ranger.yaml config to the given directory.
 * Uses js-yaml for proper serialization to avoid type coercion issues.
 */
export function writeConfig(
  dir: string,
  overrides: Record<string, unknown> = {},
): void {
  const config = {
    command: 'echo \'{"ok":true}\'',
    iterations: 1,
    warmup: 0,
    workers: 1,
    chrome: {
      versions: ["test-chrome-version"],
    },
    code: {
      repo: ".",
      refs: ["main"],
    },
    ...overrides,
  };

  const content = yaml.dump(config, { lineWidth: -1 });
  writeFileSync(resolve(dir, "chrome-ranger.yaml"), content);
}

/**
 * The path to a stub Chrome binary (just a real executable, not actually Chrome).
 * For integration tests we just need any executable path so env vars get set.
 */
export const STUB_CHROME_BIN = "/bin/sh";
