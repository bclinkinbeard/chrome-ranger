import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";
import { ensureChrome, getCacheDir } from "./chrome.js";
import { acquireLock } from "./lockfile.js";
import { buildMatrix, computePending, type MatrixCell, type RunMeta } from "./matrix.js";
import { loadRuns, appendRun, writeRuns } from "./runs.js";
import { resolveRef, ensureWorktree, refToDirName } from "./worktree.js";
import { LiveDisplay } from "./display.js";

export interface RunOptions {
  chrome?: string[];
  refs?: string[];
  append?: number;
  replace?: boolean;
}

export interface RunContext {
  config: Config;
  projectDir: string;
  options: RunOptions;
  log: (msg: string) => void;
  /** Override chrome binary resolution for testing */
  resolveChromeBin?: (version: string, cacheDir: string) => Promise<string>;
}

// Serialize runs.jsonl writes
let writeLock = Promise.resolve();

function serializedAppend(jsonlPath: string, run: RunMeta): Promise<void> {
  writeLock = writeLock.then(() => {
    appendRun(jsonlPath, run);
  });
  return writeLock;
}

async function spawnIteration(
  command: string,
  env: Record<string, string>,
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        durationMs,
      });
    });
  });
}

export async function executeRun(ctx: RunContext): Promise<void> {
  const { config, projectDir, options, log } = ctx;
  const crDir = path.join(projectDir, ".chrome-ranger");
  const jsonlPath = path.join(crDir, "runs.jsonl");
  const outputDir = path.join(crDir, "output");
  const worktreeBaseDir = path.join(crDir, "worktrees");
  const lockPath = path.join(crDir, "lock");

  fs.mkdirSync(outputDir, { recursive: true });

  // Acquire lockfile
  const releaseLock = await acquireLock(lockPath);

  try {
    // Determine which chrome versions and refs to target
    const chromeVersions = options.chrome?.length
      ? config.chrome.versions.filter((v) => options.chrome!.includes(v))
      : config.chrome.versions;

    const refs = options.refs?.length
      ? config.code.refs.filter((r) => options.refs!.includes(r))
      : config.code.refs;

    const cacheDir = getCacheDir(config.chrome.cache_dir);

    // Resolve refs
    log("Resolving refs...");
    const shaMap = new Map<string, string>();
    for (const ref of refs) {
      const sha = await resolveRef(config.code.repo, ref);
      shaMap.set(ref, sha);
      log(`  ${ref} → ${sha.slice(0, 7)}`);
    }

    // Set up worktrees
    log("Setting up worktrees...");
    const worktreePaths = new Map<string, string>();
    for (const ref of refs) {
      const sha = shaMap.get(ref)!;
      const dirName = refToDirName(ref);
      const wtPath = path.join(worktreeBaseDir, dirName);
      const result = await ensureWorktree(config.code.repo, ref, sha, wtPath);
      worktreePaths.set(ref, result);
      log(`  ${wtPath} ✓`);
    }

    // Run setup if configured
    const failedRefs = new Set<string>();
    if (config.setup) {
      log(`Running setup: ${config.setup}`);
      for (const ref of refs) {
        const sha = shaMap.get(ref)!;
        const wtPath = worktreePaths.get(ref)!;

        // Check setup marker
        const markerPath = path.join(wtPath, ".chrome-ranger-setup-done");
        if (fs.existsSync(markerPath)) {
          const markerSha = fs.readFileSync(markerPath, "utf-8").trim();
          if (markerSha === sha) {
            log(`  ${ref} (${sha.slice(0, 7)}) ✓ (cached)`);
            continue;
          }
        }

        const result = await spawnIteration(config.setup, {}, wtPath);
        if (result.exitCode !== 0) {
          log(`  ${ref} (${sha.slice(0, 7)}) ✗ exit:${result.exitCode}`);
          log(`  Skipping all iterations for ${ref}`);
          failedRefs.add(ref);
        } else {
          fs.writeFileSync(markerPath, sha);
          log(`  ${ref} (${sha.slice(0, 7)}) ✓`);
        }
      }
    }

    // Ensure Chrome binaries
    log("Ensuring Chrome binaries...");
    const chromePaths = new Map<string, string>();
    const resolveBin = ctx.resolveChromeBin ?? ensureChrome;
    for (const version of chromeVersions) {
      try {
        const chromeBin = await resolveBin(version, cacheDir);
        chromePaths.set(version, chromeBin);
        log(`  chrome@${version} ✓`);
      } catch (err) {
        log(
          `  chrome@${version} ✗ ${err instanceof Error ? err.message : err}`
        );
        // If chrome binary not available, skip those cells
      }
    }

    // Filter config for building matrix
    const activeRefs = refs.filter((r) => !failedRefs.has(r));
    const activeVersions = chromeVersions.filter((v) => chromePaths.has(v));

    // Handle --replace: remove existing runs for targeted cells
    if (options.replace) {
      const existingRuns = loadRuns(jsonlPath);
      const targetShas = new Set(activeRefs.map((r) => shaMap.get(r)!));
      const targetVersions = new Set(activeVersions);

      const kept = existingRuns.filter(
        (r) => !targetVersions.has(r.chrome) || !targetShas.has(r.sha)
      );
      const removed = existingRuns.filter(
        (r) => targetVersions.has(r.chrome) && targetShas.has(r.sha)
      );

      // Delete output files for removed runs
      for (const r of removed) {
        const stdoutFile = path.join(outputDir, `${r.id}.stdout`);
        const stderrFile = path.join(outputDir, `${r.id}.stderr`);
        try { fs.unlinkSync(stdoutFile); } catch { /* ok */ }
        try { fs.unlinkSync(stderrFile); } catch { /* ok */ }
      }

      writeRuns(jsonlPath, kept);
    }

    // Build matrix and compute pending
    const matrixConfig: Config = {
      ...config,
      chrome: { ...config.chrome, versions: activeVersions },
      code: { ...config.code, refs: activeRefs },
    };

    let pending: MatrixCell[];

    if (options.append != null) {
      // --append: add N more iterations to each targeted cell
      const existingRuns = loadRuns(jsonlPath);
      const targetShas = new Set(activeRefs.map((r) => shaMap.get(r)!));

      // Find max iteration per cell
      const maxIter = new Map<string, number>();
      for (const run of existingRuns) {
        if (targetShas.has(run.sha)) {
          const key = `${run.chrome}|${run.sha}`;
          const cur = maxIter.get(key) ?? -1;
          if (run.iteration > cur) {
            maxIter.set(key, run.iteration);
          }
        }
      }

      pending = [];
      for (const chrome of activeVersions) {
        for (const ref of activeRefs) {
          const sha = shaMap.get(ref)!;
          const key = `${chrome}|${sha}`;
          const startIter = (maxIter.get(key) ?? -1) + 1;
          for (let i = 0; i < options.append; i++) {
            pending.push({ chrome, ref, sha, iteration: startIter + i });
          }
        }
      }
    } else {
      const matrix = buildMatrix(matrixConfig, shaMap);
      const existingRuns = loadRuns(jsonlPath);
      pending = computePending(matrix, existingRuns);
    }

    if (pending.length === 0) {
      log("No pending iterations.");
      return;
    }

    // Warmup phase
    if (config.warmup > 0) {
      // Build warmup cells: one per (chrome, ref) cell × warmup count
      const warmupCells: Array<{ chrome: string; ref: string; sha: string }> = [];
      const seen = new Set<string>();
      for (const cell of pending) {
        const key = `${cell.chrome}|${cell.ref}`;
        if (!seen.has(key)) {
          seen.add(key);
          warmupCells.push({ chrome: cell.chrome, ref: cell.ref, sha: cell.sha });
        }
      }

      const warmupTasks: Array<{ chrome: string; ref: string; sha: string }> = [];
      for (const cell of warmupCells) {
        for (let w = 0; w < config.warmup; w++) {
          warmupTasks.push(cell);
        }
      }

      log(
        `Running ${pending.length} iterations + ${warmupTasks.length} warmup (${config.workers} worker${config.workers > 1 ? "s" : ""})`
      );

      // Run warmups (parallelized across workers)
      const failedWarmupCells = new Set<string>();
      const warmupQueue = [...warmupTasks];
      const warmupWorkers: Promise<void>[] = [];

      for (let w = 0; w < config.workers; w++) {
        warmupWorkers.push(
          (async () => {
            while (warmupQueue.length > 0) {
              const task = warmupQueue.shift()!;
              const cellKey = `${task.chrome}|${task.ref}`;
              if (failedWarmupCells.has(cellKey)) continue;

              const chromeBin = chromePaths.get(task.chrome)!;
              const wtPath = worktreePaths.get(task.ref)!;

              const env = {
                CHROME_BIN: chromeBin,
                CHROME_VERSION: task.chrome,
                CODE_REF: task.ref,
                CODE_SHA: task.sha,
                CODE_DIR: wtPath,
                ITERATION: "0",
              };

              log(`  [warmup] chrome@${task.chrome.split(".")[0]} × ${task.ref} (${task.sha.slice(0, 7)})`);
              const result = await spawnIteration(config.command, env, wtPath);
              if (result.exitCode !== 0) {
                failedWarmupCells.add(cellKey);
                log(`  Warmup failed for chrome@${task.chrome.split(".")[0]} × ${task.ref}, skipping cell`);
              }
            }
          })()
        );
      }
      await Promise.all(warmupWorkers);

      // Remove pending cells that failed warmup
      pending = pending.filter(
        (cell) => !failedWarmupCells.has(`${cell.chrome}|${cell.ref}`)
      );
    } else {
      log(
        `Running ${pending.length} iterations (${config.workers} worker${config.workers > 1 ? "s" : ""})`
      );
    }

    if (pending.length === 0) {
      log("No iterations to run after warmup.");
      return;
    }

    // Determine unique cells for warmup count
    const uniqueCells = new Set<string>();
    for (const cell of pending) {
      uniqueCells.add(`${cell.chrome}|${cell.ref}`);
    }

    // Create live display
    const display = new LiveDisplay(
      {
        chromeVersions: activeVersions,
        refs: activeRefs,
        iterations: config.iterations,
        warmupTotal: uniqueCells.size * config.warmup,
        totalIterations: pending.length,
        workers: config.workers,
        isTTY: process.stderr.isTTY === true,
        columns: process.stderr.columns,
        rows: process.stderr.rows,
      },
      (msg) => process.stderr.write(msg)
    );

    // Dispatch iterations across workers
    const queue = [...pending];
    const total = pending.length;
    const workers: Promise<void>[] = [];
    const runStartTime = Date.now();

    for (let w = 0; w < config.workers; w++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const cell = queue.shift()!;
            const id = crypto.randomUUID();
            const chromeBin = chromePaths.get(cell.chrome)!;
            const wtPath = worktreePaths.get(cell.ref)!;

            const env = {
              CHROME_BIN: chromeBin,
              CHROME_VERSION: cell.chrome,
              CODE_REF: cell.ref,
              CODE_SHA: cell.sha,
              CODE_DIR: wtPath,
              ITERATION: String(cell.iteration),
            };

            const major = cell.chrome.split(".")[0];
            display.setWorkerActive(
              w + 1,
              `chrome@${major} x ${cell.ref} #${cell.iteration}`
            );

            const timestamp = new Date().toISOString();
            const result = await spawnIteration(config.command, env, wtPath);

            display.setWorkerIdle(w + 1);

            // Write output files
            fs.writeFileSync(
              path.join(outputDir, `${id}.stdout`),
              result.stdout
            );
            fs.writeFileSync(
              path.join(outputDir, `${id}.stderr`),
              result.stderr
            );

            // Build run metadata
            const runMeta: RunMeta = {
              id,
              chrome: cell.chrome,
              ref: cell.ref,
              sha: cell.sha,
              iteration: cell.iteration,
              timestamp,
              durationMs: result.durationMs,
              exitCode: result.exitCode,
            };

            // Serialized append
            await serializedAppend(jsonlPath, runMeta);

            display.onIterationComplete({
              chrome: cell.chrome,
              ref: cell.ref,
              sha: cell.sha,
              iteration: cell.iteration,
              durationMs: result.durationMs,
              exitCode: result.exitCode,
              stderr: result.exitCode !== 0 ? result.stderr : undefined,
            });
          }
        })()
      );
    }

    await Promise.all(workers);
    display.onComplete(Date.now() - runStartTime);
    display.destroy();
  } finally {
    releaseLock();
  }
}
