import * as crypto from "node:crypto";
import { runIteration } from "./runner.js";
import { appendRun, writeStdout, writeStderr } from "./runs.js";
import type { PoolTask, PoolResult, RunMeta } from "./types.js";

export interface PoolOptions {
  workers: number;
  command: string;
  projectDir: string;
  stderr: NodeJS.WritableStream;
}

export async function runPool(
  tasks: PoolTask[],
  options: PoolOptions,
  signal?: AbortSignal,
): Promise<PoolResult> {
  if (tasks.length === 0) {
    return { total: 0, completed: 0, failed: 0 };
  }

  const total = tasks.length;
  let completedCount = 0;
  let failedCount = 0;
  let taskIndex = 0;

  // Simple mutex for serialized writes to runs.jsonl
  let writePromise = Promise.resolve();

  function serializedAppend(projectDir: string, run: RunMeta): Promise<void> {
    writePromise = writePromise.then(() => appendRun(projectDir, run));
    return writePromise;
  }

  async function worker(): Promise<void> {
    while (taskIndex < tasks.length) {
      if (signal?.aborted) return;

      const index = taskIndex++;
      if (index >= tasks.length) break;

      const task = tasks[index];
      const id = crypto.randomUUID();

      const result = await runIteration({
        id,
        command: options.command,
        chromeBin: task.chromeBin,
        chromeVersion: task.cell.chrome,
        ref: task.cell.ref,
        sha: task.cell.sha,
        codeDir: task.codeDir,
        iteration: task.cell.iteration,
      });

      if (signal?.aborted) return;

      // Write output files (can be parallel per run)
      await Promise.all([
        writeStdout(options.projectDir, id, result.stdout),
        writeStderr(options.projectDir, id, result.stderr),
      ]);

      // Serialize runs.jsonl write
      const meta: RunMeta = {
        id: result.id,
        chrome: result.chrome,
        ref: result.ref,
        sha: result.sha,
        iteration: result.iteration,
        timestamp: result.timestamp,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
      };
      await serializedAppend(options.projectDir, meta);

      if (result.exitCode === 0) {
        completedCount++;
      } else {
        failedCount++;
      }

      const current = completedCount + failedCount;
      const pad = String(total).length;
      const majorVersion = task.cell.chrome.split(".")[0];
      const shortSha = task.cell.sha.slice(0, 7);
      const line = `  [${String(current).padStart(pad)}/${total}] chrome@${majorVersion} × ${task.cell.ref} (${shortSha}) #${task.cell.iteration}    ${result.durationMs}ms  exit:${result.exitCode}\n`;
      options.stderr.write(line);
    }
  }

  const workers = Array.from(
    { length: Math.min(options.workers, tasks.length) },
    () => worker(),
  );

  await Promise.all(workers);

  return { total, completed: completedCount, failed: failedCount };
}
