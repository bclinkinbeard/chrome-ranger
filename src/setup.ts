import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { Worktree, SetupResult } from "./types.js";

const MARKER_FILE = ".chrome-ranger-setup-done";

export async function isSetupDone(
  worktreePath: string,
  sha: string,
): Promise<boolean> {
  try {
    const content = await fs.readFile(
      path.join(worktreePath, MARKER_FILE),
      "utf-8",
    );
    return content.trim() === sha;
  } catch {
    return false;
  }
}

export async function markSetupDone(
  worktreePath: string,
  sha: string,
): Promise<void> {
  await fs.writeFile(path.join(worktreePath, MARKER_FILE), sha + "\n", "utf-8");
}

export async function runSetups(
  setupCommand: string,
  worktrees: Worktree[],
  stderr: NodeJS.WritableStream,
): Promise<SetupResult[]> {
  const results: SetupResult[] = [];

  for (const wt of worktrees) {
    const shortSha = wt.sha.slice(0, 7);

    if (await isSetupDone(wt.path, wt.sha)) {
      stderr.write(`  ${wt.ref} (${shortSha})                 ✓  (cached)\n`);
      results.push({ ref: wt.ref, sha: wt.sha, success: true, durationMs: 0 });
      continue;
    }

    const start = performance.now();
    const exitCode = await runShellCommand(setupCommand, wt.path);
    const durationMs = Math.round(performance.now() - start);

    if (exitCode === 0) {
      await markSetupDone(wt.path, wt.sha);
      const duration = (durationMs / 1000).toFixed(1);
      stderr.write(`  ${wt.ref} (${shortSha})                 ✓  ${duration}s\n`);
      results.push({ ref: wt.ref, sha: wt.sha, success: true, durationMs });
    } else {
      stderr.write(`  ${wt.ref} (${shortSha})                 ✗  exit:${exitCode}\n`);
      stderr.write(`  Skipping all iterations for ${wt.ref}\n`);
      results.push({
        ref: wt.ref,
        sha: wt.sha,
        success: false,
        durationMs,
        exitCode,
      });
    }
  }

  return results;
}

function runShellCommand(command: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}
