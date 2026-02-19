import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Config, RunMeta, PendingRun, ResolvedRef } from "./types.js";
import { outputDir, ensureDirExists } from "./storage.js";
import { appendRun } from "./runs.js";
import { log } from "./log.js";

interface RunContext {
  config: Config;
  runsPath: string;
  cwd: string;
  chromeBinPaths: Map<string, string>;
  resolvedRefs: Map<string, ResolvedRef>;
  abortController: AbortController;
}

function majorVersion(version: string): string {
  return version.split(".")[0];
}

function formatProgress(
  index: number,
  total: number,
  run: PendingRun,
): string {
  const shortSha = run.sha.substring(0, 7);
  const label = `[${String(index).padStart(String(total).length)}/${total}]`;
  return `${label} chrome@${majorVersion(run.chrome)} \u00d7 ${run.ref} (${shortSha}) #${run.iteration}`;
}

function formatWarmupProgress(run: PendingRun): string {
  const shortSha = run.sha.substring(0, 7);
  return `[warmup] chrome@${majorVersion(run.chrome)} \u00d7 ${run.ref} (${shortSha})`;
}

async function executeCommand(
  command: string,
  env: Record<string, string>,
  cwd: string,
  stdoutPath: string | null,
  stderrPath: string | null,
  signal: AbortSignal,
): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((resolvePromise, reject) => {
    const start = Date.now();
    const child = spawn(command, {
      cwd,
      env: { ...process.env, ...env },
      shell: "/bin/sh",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    signal.addEventListener("abort", onAbort, { once: true });

    // Collect output chunks in memory, write to disk after process exits
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        reject(new Error("Aborted"));
        return;
      }
      const durationMs = Date.now() - start;

      // Write collected output to disk synchronously
      if (stdoutPath) {
        writeFileSync(stdoutPath, Buffer.concat(stdoutChunks));
      }
      if (stderrPath) {
        writeFileSync(stderrPath, Buffer.concat(stderrChunks));
      }

      resolvePromise({ exitCode: code ?? 1, durationMs });
    });

    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
}

// Serialized writer — ensures only one write to runs.jsonl at a time
class RunWriter {
  private queue: Promise<void> = Promise.resolve();

  append(runsPath: string, run: RunMeta): Promise<void> {
    this.queue = this.queue.then(() => {
      appendRun(runsPath, run);
    });
    return this.queue;
  }
}

export interface WarmupResult {
  skippedCells: Set<string>;
}

export async function runWarmups(
  ctx: RunContext,
  resolvedRefs: ResolvedRef[],
): Promise<WarmupResult> {
  const skippedCells = new Set<string>();
  const warmupCount = ctx.config.warmup;
  if (warmupCount <= 0) {
    return { skippedCells };
  }

  // Build warmup runs: one per (chrome, ref) cell
  const warmupRuns: PendingRun[] = [];
  for (const chromeVersion of ctx.config.chrome.versions) {
    for (const resolved of resolvedRefs) {
      for (let w = 0; w < warmupCount; w++) {
        warmupRuns.push({
          chrome: chromeVersion,
          ref: resolved.ref,
          sha: resolved.sha,
          iteration: w,
        });
      }
    }
  }

  const workers = ctx.config.workers;
  let index = 0;

  const runOne = async (): Promise<void> => {
    while (index < warmupRuns.length) {
      if (ctx.abortController.signal.aborted) return;

      const currentIndex = index++;
      const run = warmupRuns[currentIndex];
      const cellKey = `${run.chrome}::${run.sha}`;

      if (skippedCells.has(cellKey)) continue;

      const chromeBin = ctx.chromeBinPaths.get(run.chrome)!;
      const resolved = ctx.resolvedRefs.get(run.ref)!;

      log(`  ${formatWarmupProgress(run)}`);

      try {
        const result = await executeCommand(
          ctx.config.command,
          {
            CHROME_BIN: chromeBin,
            CHROME_VERSION: run.chrome,
            CODE_REF: run.ref,
            CODE_SHA: run.sha,
            CODE_DIR: resolved.worktreeDir,
            ITERATION: String(run.iteration),
          },
          resolved.worktreeDir,
          null,
          null,
          ctx.abortController.signal,
        );

        if (result.exitCode !== 0) {
          log(
            `  Warmup failed for chrome@${majorVersion(run.chrome)} \u00d7 ${run.ref} — skipping cell`,
          );
          skippedCells.add(cellKey);
        }
      } catch {
        if (ctx.abortController.signal.aborted) return;
        skippedCells.add(cellKey);
      }
    }
  };

  const workerPromises = Array.from({ length: Math.min(workers, warmupRuns.length) }, () =>
    runOne(),
  );
  await Promise.all(workerPromises);

  return { skippedCells };
}

export async function runIterations(
  ctx: RunContext,
  pendingRuns: PendingRun[],
  skippedCells: Set<string>,
): Promise<{ completed: number; failed: number }> {
  const outDir = outputDir(ctx.cwd);
  ensureDirExists(outDir);

  const writer = new RunWriter();
  const workers = ctx.config.workers;
  let runIndex = 0;
  let completedCount = 0;
  let failedCount = 0;
  const total = pendingRuns.length;

  // Filter out runs for skipped cells (from warmup failures)
  const runnableRuns = pendingRuns.filter(
    (r) => !skippedCells.has(`${r.chrome}::${r.sha}`),
  );
  const skippedCount = total - runnableRuns.length;
  if (skippedCount > 0) {
    // Adjust total for display
  }

  const displayTotal = runnableRuns.length;

  const runOne = async (): Promise<void> => {
    while (runIndex < runnableRuns.length) {
      if (ctx.abortController.signal.aborted) return;

      const currentIndex = runIndex++;
      const run = runnableRuns[currentIndex];
      const id = randomUUID();
      const chromeBin = ctx.chromeBinPaths.get(run.chrome)!;
      const resolved = ctx.resolvedRefs.get(run.ref)!;

      const stdoutPath = resolve(outDir, `${id}.stdout`);
      const stderrPath = resolve(outDir, `${id}.stderr`);

      const displayIndex = currentIndex + 1;

      try {
        const result = await executeCommand(
          ctx.config.command,
          {
            CHROME_BIN: chromeBin,
            CHROME_VERSION: run.chrome,
            CODE_REF: run.ref,
            CODE_SHA: run.sha,
            CODE_DIR: resolved.worktreeDir,
            ITERATION: String(run.iteration),
          },
          resolved.worktreeDir,
          stdoutPath,
          stderrPath,
          ctx.abortController.signal,
        );

        const meta: RunMeta = {
          id,
          chrome: run.chrome,
          ref: run.ref,
          sha: run.sha,
          iteration: run.iteration,
          timestamp: new Date().toISOString(),
          durationMs: result.durationMs,
          exitCode: result.exitCode,
        };

        await writer.append(ctx.runsPath, meta);

        const progress = formatProgress(displayIndex, displayTotal, run);
        const duration = `${result.durationMs}ms`.padStart(8);
        log(`  ${progress}  ${duration}  exit:${result.exitCode}`);

        completedCount++;
        if (result.exitCode !== 0) {
          failedCount++;
        }
      } catch {
        if (ctx.abortController.signal.aborted) return;
        // Execution error — not a clean exit
        completedCount++;
        failedCount++;
      }
    }
  };

  const workerPromises = Array.from(
    { length: Math.min(workers, runnableRuns.length) },
    () => runOne(),
  );
  await Promise.all(workerPromises);

  return { completed: completedCount, failed: failedCount };
}

export function createRunContext(
  config: Config,
  runsPath: string,
  cwd: string,
  chromeBinPaths: Map<string, string>,
  resolvedRefs: ResolvedRef[],
): RunContext {
  const refsMap = new Map<string, ResolvedRef>();
  for (const r of resolvedRefs) {
    refsMap.set(r.ref, r);
  }

  return {
    config,
    runsPath,
    cwd,
    chromeBinPaths,
    resolvedRefs: refsMap,
    abortController: new AbortController(),
  };
}
