import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";
import type { ResolvedRef } from "./types.js";
import { worktreesDir, ensureDirExists } from "./storage.js";
import { log, logError } from "./log.js";

function sanitizeRefName(ref: string): string {
  return ref.replace(/\//g, "-");
}

function disambiguateDir(baseDir: string, name: string): string {
  let candidate = resolve(baseDir, name);
  let suffix = 1;
  while (existsSync(candidate)) {
    // Check if it's already our worktree by checking .git file
    const gitFile = resolve(candidate, ".git");
    if (existsSync(gitFile)) {
      return candidate;
    }
    candidate = resolve(baseDir, `${name}-${suffix}`);
    suffix++;
  }
  return candidate;
}

export function resolveRef(repoDir: string, ref: string): string {
  try {
    const sha = execSync(`git rev-parse "${ref}"`, {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha;
  } catch {
    throw new Error(`Git ref not found: ${ref}`);
  }
}

export function resolveRefs(
  repoDir: string,
  refs: string[],
  projectCwd: string,
): ResolvedRef[] {
  const wtDir = worktreesDir(projectCwd);
  const resolved: ResolvedRef[] = [];

  log("Resolving refs...");
  for (const ref of refs) {
    const sha = resolveRef(repoDir, ref);
    const shortSha = sha.substring(0, 7);
    const dirName = sanitizeRefName(ref);
    const worktreeDir = resolve(wtDir, dirName);

    log(`  ${ref.padEnd(20)} \u2192 ${shortSha}`);
    resolved.push({ ref, sha, worktreeDir });
  }

  return resolved;
}

export function setupWorktrees(
  repoDir: string,
  resolvedRefs: ResolvedRef[],
  projectCwd: string,
): void {
  const wtDir = worktreesDir(projectCwd);
  ensureDirExists(wtDir);

  log("\nSetting up worktrees...");
  for (const resolved of resolvedRefs) {
    if (existsSync(resolved.worktreeDir)) {
      // Worktree already exists — update to correct commit
      try {
        execSync(`git checkout --detach "${resolved.sha}"`, {
          cwd: resolved.worktreeDir,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // May already be at the right commit
      }
      log(
        `  ${resolved.worktreeDir.replace(repoDir + "/", "")}  \u2713`,
      );
    } else {
      // Create new worktree
      execSync(
        `git worktree add --detach "${resolved.worktreeDir}" "${resolved.sha}"`,
        {
          cwd: repoDir,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      log(
        `  ${resolved.worktreeDir.replace(repoDir + "/", "")}  \u2713`,
      );
    }
  }
}

const SETUP_MARKER = ".chrome-ranger-setup-done";

export function needsSetup(worktreeDir: string, sha: string): boolean {
  const markerPath = resolve(worktreeDir, SETUP_MARKER);
  if (!existsSync(markerPath)) {
    return true;
  }
  const markerSha = readFileSync(markerPath, "utf-8").trim();
  return markerSha !== sha;
}

export function markSetupDone(worktreeDir: string, sha: string): void {
  writeFileSync(resolve(worktreeDir, SETUP_MARKER), sha + "\n");
}

export async function runSetup(
  setupCmd: string,
  resolvedRefs: ResolvedRef[],
): Promise<Set<string>> {
  const skippedRefs = new Set<string>();

  const refsNeedingSetup = resolvedRefs.filter((r) =>
    needsSetup(r.worktreeDir, r.sha),
  );

  if (refsNeedingSetup.length === 0) {
    return skippedRefs;
  }

  log(`\nRunning setup: ${setupCmd}`);
  for (const resolved of refsNeedingSetup) {
    const shortSha = resolved.sha.substring(0, 7);
    const start = Date.now();
    try {
      execSync(setupCmd, {
        cwd: resolved.worktreeDir,
        stdio: ["pipe", "pipe", "pipe"],
        shell: "/bin/sh",
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(
        `  ${resolved.ref} (${shortSha})  \u2713  ${elapsed}s`,
      );
      markSetupDone(resolved.worktreeDir, resolved.sha);
    } catch (err: unknown) {
      const exitCode =
        (err as { status?: number }).status ?? 1;
      log(
        `  ${resolved.ref} (${shortSha})  \u2717  exit:${exitCode}`,
      );
      log(`  Skipping all iterations for ${resolved.ref}`);
      skippedRefs.add(resolved.ref);
    }
  }

  return skippedRefs;
}

export function cleanWorktrees(repoDir: string, projectCwd: string): void {
  const wtDir = worktreesDir(projectCwd);
  if (existsSync(wtDir)) {
    rmSync(wtDir, { recursive: true, force: true });
    log(`Removed worktrees at ${wtDir}`);
    // Prune worktree references from git
    try {
      execSync("git worktree prune", {
        cwd: repoDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore prune errors
    }
  } else {
    log("No worktrees to clean.");
  }
}
