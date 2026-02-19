import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export function refToDirName(ref: string): string {
  return ref.replace(/\//g, "-");
}

export async function resolveRef(repo: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", ref], {
    cwd: repo,
  });
  return stdout.trim();
}

export async function ensureWorktree(
  repo: string,
  ref: string,
  sha: string,
  worktreeDir: string
): Promise<string> {
  if (fs.existsSync(worktreeDir)) {
    // Worktree already exists — update to the desired SHA
    await execFileAsync("git", ["checkout", sha, "--detach"], {
      cwd: worktreeDir,
    });
    return worktreeDir;
  }

  await execFileAsync(
    "git",
    ["worktree", "add", "--detach", worktreeDir, sha],
    { cwd: repo }
  );
  return worktreeDir;
}

export async function cleanWorktrees(
  baseDir: string,
  repo: string
): Promise<void> {
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
  await execFileAsync("git", ["worktree", "prune"], { cwd: repo });
}
