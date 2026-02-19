import { resolve } from "node:path";
import type { Config, ResolvedRef } from "../types.js";
import { findConfigPath, parseConfig } from "../config.js";
import { projectDir, runsJsonlPath } from "../storage.js";
import { Lockfile } from "../lock.js";
import { loadRuns, removeRuns } from "../runs.js";
import {
  computeFullMatrix,
  computePending,
  computeAppendRuns,
} from "../matrix.js";
import { ensureChrome } from "../chrome.js";
import {
  resolveRefs,
  setupWorktrees,
  runSetup,
} from "../worktree.js";
import {
  createRunContext,
  runWarmups,
  runIterations,
} from "../runner.js";
import { log, logError } from "../log.js";

interface RunOptions {
  chrome?: string[];
  refs?: string[];
  append?: number;
  replace?: boolean;
}

export async function runCommand(
  cwd: string,
  options: RunOptions,
): Promise<void> {
  // Parse config
  const configPath = findConfigPath(cwd);
  let config: Config;
  try {
    config = parseConfig(configPath);
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const projDir = projectDir(cwd);
  const runsPath = runsJsonlPath(cwd);

  // Acquire lock
  const lock = new Lockfile(projDir);
  try {
    lock.acquire();
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
    return;
  }

  // Set up signal handlers
  const abortOnSignal = () => {
    if (runCtx) {
      runCtx.abortController.abort();
    }
    lock.release();
    process.exit(1);
  };
  process.on("SIGINT", abortOnSignal);
  process.on("SIGTERM", abortOnSignal);

  let runCtx: ReturnType<typeof createRunContext> | null = null;

  try {
    // Resolve repo path
    const repoDir = resolve(cwd, config.code.repo);

    // Apply filters
    const chromeFilter = options.chrome?.length ? options.chrome : undefined;
    const refsFilter = options.refs?.length ? options.refs : undefined;

    const activeVersions = chromeFilter ?? config.chrome.versions;
    const activeRefNames = refsFilter ?? config.code.refs;

    // Resolve refs
    let allResolved: ResolvedRef[];
    try {
      allResolved = resolveRefs(repoDir, activeRefNames, cwd);
    } catch (err: unknown) {
      logError((err as Error).message);
      process.exitCode = 1;
      return;
    }

    // Set up worktrees
    setupWorktrees(repoDir, allResolved, cwd);

    // Run setup if configured
    let skippedRefs = new Set<string>();
    if (config.setup) {
      skippedRefs = await runSetup(config.setup, allResolved);
    }

    // Filter out skipped refs
    const activeResolved = allResolved.filter(
      (r) => !skippedRefs.has(r.ref),
    );

    if (activeResolved.length === 0) {
      log("\nNo refs available after setup. Nothing to run.");
      return;
    }

    // Ensure Chrome binaries
    log("\nEnsuring Chrome binaries...");
    const chromeBinPaths = new Map<string, string>();
    for (const version of activeVersions) {
      try {
        const binPath = await ensureChrome(
          version,
          config.chrome.cache_dir,
        );
        chromeBinPaths.set(version, binPath);
      } catch (err: unknown) {
        logError(
          `Failed to download Chrome ${version}: ${(err as Error).message}`,
        );
        process.exitCode = 1;
        return;
      }
    }

    // Handle --replace: delete targeted runs
    if (options.replace) {
      removeRuns(runsPath, cwd, (run) => {
        const chromeMatch = chromeFilter
          ? chromeFilter.includes(run.chrome)
          : true;
        const refMatch = refsFilter
          ? refsFilter.includes(run.ref)
          : true;
        return chromeMatch && refMatch;
      });
    }

    // Compute what needs to run
    const existingRuns = loadRuns(runsPath);
    let pendingRuns;

    if (options.append !== undefined) {
      pendingRuns = computeAppendRuns(
        config,
        activeResolved,
        existingRuns,
        options.append,
        chromeFilter,
        refsFilter,
      );
    } else {
      // Scope the config to filtered versions for matrix computation
      const scopedConfig = {
        ...config,
        chrome: { ...config.chrome, versions: activeVersions },
      };
      const fullMatrix = computeFullMatrix(scopedConfig, activeResolved);
      pendingRuns = computePending(fullMatrix, existingRuns);
    }

    if (pendingRuns.length === 0) {
      const totalCompleted = existingRuns.length;
      log(`\nSkipping ${totalCompleted} completed iterations.`);
      log("Nothing to run.");
      return;
    }

    // Create run context
    runCtx = createRunContext(
      config,
      runsPath,
      cwd,
      chromeBinPaths,
      activeResolved,
    );

    // Warmup
    const warmupCells =
      config.warmup > 0
        ? activeVersions.length * activeResolved.length * config.warmup
        : 0;
    log(
      `\nRunning ${pendingRuns.length} iterations${warmupCells > 0 ? ` + ${warmupCells} warmup` : ""} (${config.workers} worker${config.workers > 1 ? "s" : ""})\n`,
    );

    const { skippedCells } = await runWarmups(runCtx, activeResolved);

    // Run iterations
    const { completed, failed } = await runIterations(
      runCtx,
      pendingRuns,
      skippedCells,
    );

    // Summary
    const failedSuffix = failed > 0 ? ` (${failed} failed)` : "";
    log(
      `\nDone. ${completed} runs logged to ${runsPath}${failedSuffix}`,
    );
  } catch (err: unknown) {
    logError((err as Error).message, err);
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abortOnSignal);
    process.removeListener("SIGTERM", abortOnSignal);
    lock.release();
  }
}
