import * as crypto from "node:crypto";
import { runIteration } from "./runner.js";
import type { WarmupTask, WarmupResult } from "./types.js";

export async function runWarmups(
  tasks: WarmupTask[],
  warmupCount: number,
  command: string,
  workers: number,
  stderr: NodeJS.WritableStream,
  signal?: AbortSignal,
): Promise<WarmupResult> {
  const passed: Array<{ chrome: string; ref: string }> = [];
  const failed: Array<{ chrome: string; ref: string; exitCode: number }> = [];
  const failedCells = new Set<string>();

  // Build warmup iteration list: warmupCount per cell
  interface WarmupIteration {
    task: WarmupTask;
    warmupIndex: number;
  }

  const iterations: WarmupIteration[] = [];
  for (const task of tasks) {
    for (let i = 0; i < warmupCount; i++) {
      iterations.push({ task, warmupIndex: i });
    }
  }

  let iterIndex = 0;

  async function worker(): Promise<void> {
    while (iterIndex < iterations.length) {
      if (signal?.aborted) return;

      const idx = iterIndex++;
      if (idx >= iterations.length) break;

      const { task } = iterations[idx];
      const cellKey = `${task.chrome}\0${task.ref}`;

      // Skip if this cell already failed
      if (failedCells.has(cellKey)) continue;

      const majorVersion = task.chrome.split(".")[0];
      const shortSha = task.sha.slice(0, 7);
      stderr.write(
        `  [warmup] chrome@${majorVersion} × ${task.ref} (${shortSha})\n`,
      );

      const result = await runIteration({
        id: crypto.randomUUID(),
        command,
        chromeBin: task.chromeBin,
        chromeVersion: task.chrome,
        ref: task.ref,
        sha: task.sha,
        codeDir: task.codeDir,
        iteration: 0, // warmup iterations don't count
      });

      if (signal?.aborted) return;

      if (result.exitCode !== 0) {
        failedCells.add(cellKey);
        failed.push({
          chrome: task.chrome,
          ref: task.ref,
          exitCode: result.exitCode,
        });
        stderr.write(
          `  Warmup failed for chrome@${majorVersion} × ${task.ref} — skipping iterations\n`,
        );
      }
      // Output is completely discarded — not written anywhere
    }
  }

  const workerPromises = Array.from(
    { length: Math.min(workers, iterations.length || 1) },
    () => worker(),
  );
  await Promise.all(workerPromises);

  // Determine which cells passed (not in failed set)
  const failedKeys = new Set(failed.map((f) => `${f.chrome}\0${f.ref}`));
  for (const task of tasks) {
    const key = `${task.chrome}\0${task.ref}`;
    if (!failedKeys.has(key)) {
      passed.push({ chrome: task.chrome, ref: task.ref });
    }
  }

  return { passed, failed };
}
