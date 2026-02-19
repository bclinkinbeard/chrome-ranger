import { loadConfig } from "./config.js";
import { loadRuns, deleteRuns, ensureDataDir } from "./runs.js";
import {
  generateMatrix,
  computePending,
  filterMatrix,
  computeAppend,
} from "./matrix.js";
import { acquireLock, releaseLock } from "./lockfile.js";
import { ensureChrome, resolveCacheDir } from "./chrome.js";
import { resolveRef, ensureWorktree } from "./worktrees.js";
import { runSetups } from "./setup.js";
import { runPool } from "./pool.js";
import { runWarmups } from "./warmup.js";
import { installSignalHandlers, removeSignalHandlers } from "./signals.js";
import type {
  RunOptions,
  RunSummary,
  ResolvedRef,
  Worktree,
  ChromeInstallation,
  WarmupTask,
  PoolTask,
} from "./types.js";

export async function executeRun(options: RunOptions): Promise<RunSummary> {
  const { projectDir, stderr } = options;
  const skippedRefs: string[] = [];

  // Phase 1: Lock
  try {
    await acquireLock(projectDir);
  } catch (err: unknown) {
    stderr.write(`error: ${(err as Error).message}\n`);
    return { total: 0, completed: 0, failed: 0, skippedRefs: [] };
  }

  try {
    await ensureDataDir(projectDir);

    // Phase 2: Parse config
    const config = await loadConfig(options.configPath);

    // Phase 3: Resolve refs
    stderr.write("\nResolving refs...\n");
    const resolvedRefs: ResolvedRef[] = [];
    const refsToResolve =
      options.refsFilter && options.refsFilter.length > 0
        ? config.code.refs.filter((r) => options.refsFilter!.includes(r))
        : config.code.refs;

    for (const ref of refsToResolve) {
      try {
        const sha = await resolveRef(config.code.repo, ref);
        const shortSha = sha.slice(0, 7);
        stderr.write(`  ${ref}        → ${shortSha}\n`);
        resolvedRefs.push({ ref, sha });
      } catch (err: unknown) {
        stderr.write(`error: ${(err as Error).message}\n`);
        skippedRefs.push(ref);
      }
    }

    if (resolvedRefs.length === 0) {
      stderr.write("\nNo valid refs to process.\n");
      return { total: 0, completed: 0, failed: 0, skippedRefs };
    }

    // Phase 4: Worktrees
    stderr.write("\nSetting up worktrees...\n");
    const worktrees: Worktree[] = [];
    for (const { ref, sha } of resolvedRefs) {
      const wt = await ensureWorktree(projectDir, ref, sha);
      stderr.write(`  ${wt.path}              ✓\n`);
      worktrees.push(wt);
    }

    // Build worktree lookup
    const worktreeMap = new Map<string, string>();
    for (const wt of worktrees) {
      worktreeMap.set(wt.ref, wt.path);
    }

    // Phase 5: Setup
    const failedSetupRefs = new Set<string>();
    if (config.setup) {
      stderr.write(`\nRunning setup: ${config.setup}\n`);
      const setupResults = await runSetups(config.setup, worktrees, stderr);
      for (const result of setupResults) {
        if (!result.success) {
          failedSetupRefs.add(result.ref);
          skippedRefs.push(result.ref);
        }
      }
    }

    // Phase 6: Chrome binaries
    stderr.write("\nEnsuring Chrome binaries...\n");
    const cacheDir = resolveCacheDir(config.chrome.cache_dir);
    const chromeInstalls = new Map<string, ChromeInstallation>();
    const chromeVersionsToUse =
      options.chromeFilter && options.chromeFilter.length > 0
        ? config.chrome.versions.filter((v) =>
            options.chromeFilter!.includes(v),
          )
        : config.chrome.versions;

    for (const version of chromeVersionsToUse) {
      const start = performance.now();
      try {
        const inst = await ensureChrome(version, cacheDir);
        const durationMs = Math.round(performance.now() - start);
        const label = durationMs < 1000 ? "cached" : `done (${(durationMs / 1000).toFixed(0)}s)`;
        stderr.write(`  chrome@${version}       ✓  ${label}\n`);
        chromeInstalls.set(version, inst);
      } catch (err: unknown) {
        stderr.write(`error: ${(err as Error).message}\n`);
      }
    }

    if (chromeInstalls.size === 0) {
      stderr.write("\nNo Chrome binaries available.\n");
      return { total: 0, completed: 0, failed: 0, skippedRefs };
    }

    // Phase 7: Compute work
    const existingRuns = await loadRuns(projectDir);
    const activeRefs = resolvedRefs.filter(
      (r) => !failedSetupRefs.has(r.ref),
    );
    const activeChromeVersions = [...chromeInstalls.keys()];

    let pendingCells;

    if (options.replace) {
      await deleteRuns(projectDir, (run) => {
        const chromeMatch =
          !options.chromeFilter ||
          options.chromeFilter.length === 0 ||
          options.chromeFilter.includes(run.chrome);
        const refMatch =
          !options.refsFilter ||
          options.refsFilter.length === 0 ||
          activeRefs.some((r) => r.ref === run.ref);
        return chromeMatch && refMatch;
      });
      const matrix = generateMatrix(
        activeChromeVersions,
        activeRefs,
        config.iterations,
      );
      pendingCells = filterMatrix(
        matrix,
        options.chromeFilter,
        options.refsFilter,
      );
    } else if (options.appendCount && options.appendCount > 0) {
      pendingCells = computeAppend(
        activeChromeVersions,
        activeRefs,
        existingRuns,
        options.appendCount,
        options.chromeFilter,
        options.refsFilter,
      );
    } else {
      const matrix = generateMatrix(
        activeChromeVersions,
        activeRefs,
        config.iterations,
      );
      const filtered = filterMatrix(
        matrix,
        options.chromeFilter,
        options.refsFilter,
      );
      pendingCells = computePending(filtered, existingRuns);
    }

    if (pendingCells.length === 0) {
      const totalCells =
        activeChromeVersions.length * activeRefs.length * config.iterations;
      stderr.write(`\nSkipping ${totalCells} completed iterations.\n`);
      return { total: 0, completed: 0, failed: 0, skippedRefs };
    }

    // Install signal handlers
    const controller = installSignalHandlers(projectDir, () => {
      // cleanup: nothing extra needed beyond abort
    });

    try {
      // Phase 8: Warmup
      if (config.warmup > 0) {
        const warmupCellKeys = new Set<string>();
        const warmupTasks: WarmupTask[] = [];

        for (const cell of pendingCells) {
          const key = `${cell.chrome}\0${cell.ref}`;
          if (warmupCellKeys.has(key)) continue;
          warmupCellKeys.add(key);

          const chromeInstall = chromeInstalls.get(cell.chrome);
          const wt = worktrees.find((w) => w.ref === cell.ref);
          if (!chromeInstall || !wt) continue;

          warmupTasks.push({
            chrome: cell.chrome,
            chromeBin: chromeInstall.executablePath,
            ref: cell.ref,
            sha: cell.sha,
            codeDir: wt.path,
          });
        }

        const warmupResult = await runWarmups(
          warmupTasks,
          config.warmup,
          config.command,
          config.workers,
          stderr,
          controller.signal,
        );

        const failedWarmupKeys = new Set(
          warmupResult.failed.map((f) => `${f.chrome}\0${f.ref}`),
        );
        if (failedWarmupKeys.size > 0) {
          pendingCells = pendingCells.filter(
            (cell) => !failedWarmupKeys.has(`${cell.chrome}\0${cell.ref}`),
          );
        }

        if (pendingCells.length === 0) {
          stderr.write("\nAll warmups failed. Nothing to run.\n");
          return { total: 0, completed: 0, failed: 0, skippedRefs };
        }
      }

      // Phase 9: Iterate
      const warmupTotal = config.warmup > 0
        ? new Set(pendingCells.map((c) => `${c.chrome}\0${c.ref}`)).size * config.warmup
        : 0;
      stderr.write(
        `\nRunning ${pendingCells.length} iterations${warmupTotal > 0 ? ` + ${warmupTotal} warmup` : ""} (${config.workers} workers)\n\n`,
      );

      const poolTasks: PoolTask[] = pendingCells.map((cell) => {
        const chromeInstall = chromeInstalls.get(cell.chrome)!;
        const codeDir = worktreeMap.get(cell.ref) ?? projectDir;
        return { cell, chromeBin: chromeInstall.executablePath, codeDir };
      });

      const result = await runPool(
        poolTasks,
        {
          workers: config.workers,
          command: config.command,
          projectDir,
          stderr,
        },
        controller.signal,
      );

      // Phase 10: Summary
      const suffix = result.failed > 0 ? ` (${result.failed} failed)` : "";
      stderr.write(
        `\nDone. ${result.completed + result.failed} runs logged to .chrome-ranger/runs.jsonl${suffix}\n`,
      );

      return {
        total: result.total,
        completed: result.completed,
        failed: result.failed,
        skippedRefs,
      };
    } finally {
      removeSignalHandlers();
    }
  } catch (err: unknown) {
    stderr.write(`error: ${(err as Error).message}\n`);
    if (process.env.DEBUG === "chrome-ranger") {
      stderr.write(`${(err as Error).stack}\n`);
    }
    return { total: 0, completed: 0, failed: 0, skippedRefs };
  } finally {
    await releaseLock(projectDir).catch(() => {});
  }
}
