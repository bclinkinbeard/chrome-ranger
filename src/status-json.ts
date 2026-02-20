/**
 * Formats the `status --json` output.
 * Hierarchical schema: cells contain their runs.
 */

import type { Config } from "./config.js";
import type { RunMeta } from "./matrix.js";

export interface CellStats {
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
}

export interface CellJson {
  chrome: string;
  ref: string;
  sha: string;
  target: number;
  passed: number;
  failed: number;
  complete: boolean;
  stats?: CellStats;
  runs: Array<{
    id: string;
    iteration: number;
    exitCode: number;
    durationMs: number;
    timestamp: string;
  }>;
}

export interface StatusJson {
  version: number;
  config: {
    iterations: number;
    warmup: number;
    workers: number;
    command: string;
  };
  matrix: {
    chrome: string[];
    refs: Array<{ name: string; sha: string }>;
  };
  summary: {
    totalRuns: number;
    passed: number;
    failed: number;
    remaining: number;
    cellsTotal: number;
    cellsComplete: number;
    cellsWithFailures: number;
    firstRun: string | null;
    lastRun: string | null;
  };
  cells: CellJson[];
}

function computeStats(durations: number[]): CellStats {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Math.round(sum / sorted.length);

  let median: number;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    median = Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  } else {
    median = sorted[mid];
  }

  return {
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    meanMs: mean,
    medianMs: median,
  };
}

export function formatStatusJson(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>
): StatusJson {
  const { versions } = config.chrome;
  const { refs } = config.code;

  // Build cell map: key = "chrome|sha"
  const cellMap = new Map<
    string,
    {
      chrome: string;
      ref: string;
      sha: string;
      runs: RunMeta[];
      passed: number;
      failed: number;
    }
  >();

  // Initialize cells for all chrome × ref combinations
  for (const chrome of versions) {
    for (const ref of refs) {
      const sha = shaMap.get(ref) ?? "";
      const key = `${chrome}|${sha}`;
      if (!cellMap.has(key)) {
        cellMap.set(key, { chrome, ref, sha, runs: [], passed: 0, failed: 0 });
      }
    }
  }

  // Populate with run data
  const currentShas = new Set([...shaMap.values()]);
  for (const run of runs) {
    if (!currentShas.has(run.sha)) continue;

    const key = `${run.chrome}|${run.sha}`;
    const cell = cellMap.get(key);
    if (!cell) continue;

    cell.runs.push(run);
    if (run.exitCode === 0) {
      cell.passed++;
    } else {
      cell.failed++;
    }
  }

  // Build cells array
  const cells: CellJson[] = [];
  let cellsComplete = 0;
  let cellsWithFailures = 0;
  let totalRemaining = 0;

  for (const [, cell] of cellMap) {
    const complete = cell.passed >= config.iterations;
    if (complete) cellsComplete++;
    if (cell.failed > 0) cellsWithFailures++;
    totalRemaining += Math.max(0, config.iterations - cell.passed);

    // Compute stats over passing runs only
    const passingDurations = cell.runs
      .filter((r) => r.exitCode === 0)
      .map((r) => r.durationMs);

    const stats =
      passingDurations.length > 0 ? computeStats(passingDurations) : undefined;

    cells.push({
      chrome: cell.chrome,
      ref: cell.ref,
      sha: cell.sha,
      target: config.iterations,
      passed: cell.passed,
      failed: cell.failed,
      complete,
      stats,
      runs: cell.runs.map((r) => ({
        id: r.id,
        iteration: r.iteration,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        timestamp: r.timestamp,
      })),
    });
  }

  // Summary
  const filteredRuns = runs.filter((r) => currentShas.has(r.sha));
  const totalRuns = filteredRuns.length;
  const passed = filteredRuns.filter((r) => r.exitCode === 0).length;
  const failed = filteredRuns.filter((r) => r.exitCode !== 0).length;

  const timestamps = filteredRuns.map((r) => r.timestamp).sort();

  return {
    version: 1,
    config: {
      iterations: config.iterations,
      warmup: config.warmup,
      workers: config.workers,
      command: config.command,
    },
    matrix: {
      chrome: versions,
      refs: refs.map((name) => ({ name, sha: shaMap.get(name) ?? "" })),
    },
    summary: {
      totalRuns,
      passed,
      failed,
      remaining: totalRemaining,
      cellsTotal: cellMap.size,
      cellsComplete,
      cellsWithFailures,
      firstRun: timestamps.length > 0 ? timestamps[0] : null,
      lastRun: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    },
    cells,
  };
}
