import { resolve } from "node:path";
import { findConfigPath, parseConfig } from "../config.js";
import { cleanWorktrees } from "../worktree.js";
import { logError } from "../log.js";

export function cleanCommand(cwd: string): void {
  let repoDir = cwd;
  try {
    const config = parseConfig(findConfigPath(cwd));
    repoDir = resolve(cwd, config.code.repo);
  } catch {
    // No config — use cwd as repo dir
  }

  try {
    cleanWorktrees(repoDir);
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
  }
}
