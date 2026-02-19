import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

const PROJECT_DIR = ".chrome-ranger";

export function projectDir(cwd: string): string {
  return resolve(cwd, PROJECT_DIR);
}

export function outputDir(cwd: string): string {
  return resolve(cwd, PROJECT_DIR, "output");
}

export function runsJsonlPath(cwd: string): string {
  return resolve(cwd, PROJECT_DIR, "runs.jsonl");
}

export function worktreesDir(cwd: string): string {
  return resolve(cwd, PROJECT_DIR, "worktrees");
}

export function chromeCacheDir(configCacheDir?: string): string {
  if (configCacheDir) {
    return resolve(configCacheDir);
  }
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) {
    return resolve(xdg, "chrome-ranger");
  }
  return resolve(homedir(), ".cache", "chrome-ranger");
}

export function ensureDirExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureParentDir(filePath: string): void {
  ensureDirExists(dirname(filePath));
}
