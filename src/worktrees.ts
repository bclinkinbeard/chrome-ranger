import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Worktree } from "./types.js";

const execFileAsync = promisify(execFile);

export async function resolveRef(
  repoDir: string,
  ref: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", ref], {
      cwd: repoDir,
    });
    return stdout.trim();
  } catch {
    throw new Error(`Git ref not found: ${ref}`);
  }
}

export async function ensureWorktree(
  projectDir: string,
  ref: string,
  sha: string,
  repoDir: string = projectDir,
): Promise<Worktree> {
  const worktreesDir = path.join(projectDir, ".chrome-ranger", "worktrees");
  await fs.mkdir(worktreesDir, { recursive: true });

  // Try the base name first — if it already exists and is a valid worktree, reuse it
  const baseName = ref.replace(/\//g, "-");
  const basePath = path.join(worktreesDir, baseName);

  try {
    const stat = await fs.stat(basePath);
    if (stat.isDirectory()) {
      try {
        await execFileAsync("git", ["-C", basePath, "rev-parse", "--git-dir"]);
        // Valid worktree — checkout the target SHA
        await execFileAsync("git", ["-C", basePath, "checkout", "--detach", sha]);
        return { ref, sha, path: basePath };
      } catch {
        // Not a valid worktree — remove and recreate below
        await fs.rm(basePath, { recursive: true, force: true });
      }
    }
  } catch {
    // Doesn't exist — will create below
  }

  // If base name is free now, use it; otherwise disambiguate
  let existingNames: string[] = [];
  try {
    existingNames = await fs.readdir(worktreesDir);
  } catch {
    // empty
  }

  const safeName = safeWorktreeName(ref, existingNames);
  const worktreePath = path.join(worktreesDir, safeName);

  // Create new worktree
  await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, sha], {
    cwd: repoDir,
  });

  return { ref, sha, path: worktreePath };
}

export function safeWorktreeName(
  ref: string,
  existingNames: string[],
): string {
  const base = ref.replace(/\//g, "-");
  if (!existingNames.includes(base)) {
    return base;
  }
  // Disambiguate with numeric suffix
  let suffix = 2;
  while (existingNames.includes(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}

export async function cleanWorktrees(projectDir: string): Promise<void> {
  const worktreesDir = path.join(projectDir, ".chrome-ranger", "worktrees");

  let entries: string[];
  try {
    entries = await fs.readdir(worktreesDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    const entryPath = path.join(worktreesDir, entry);
    try {
      await execFileAsync("git", ["worktree", "remove", entryPath, "--force"], {
        cwd: projectDir,
      });
    } catch {
      // If git worktree remove fails, try manual cleanup
      await fs.rm(entryPath, { recursive: true, force: true });
    }
  }

  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: projectDir });
  } catch {
    // ignore
  }

  try {
    await fs.rm(worktreesDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
