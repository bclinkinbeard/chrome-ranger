import type { Config, RunMeta, PendingRun, ResolvedRef } from "./types.js";

export function cellKey(chrome: string, sha: string): string {
  return `${chrome}::${sha}`;
}

export function computeFullMatrix(
  config: Config,
  resolvedRefs: ResolvedRef[],
): PendingRun[] {
  const runs: PendingRun[] = [];
  for (const chromeVersion of config.chrome.versions) {
    for (const resolved of resolvedRefs) {
      for (let i = 0; i < config.iterations; i++) {
        runs.push({
          chrome: chromeVersion,
          ref: resolved.ref,
          sha: resolved.sha,
          iteration: i,
        });
      }
    }
  }
  return runs;
}

export function computePending(
  fullMatrix: PendingRun[],
  existingRuns: RunMeta[],
): PendingRun[] {
  // Build a set of completed cells: (chrome, sha, iteration) where exitCode === 0
  const completed = new Set<string>();
  for (const run of existingRuns) {
    if (run.exitCode === 0) {
      completed.add(`${run.chrome}::${run.sha}::${run.iteration}`);
    }
  }

  return fullMatrix.filter(
    (cell) => !completed.has(`${cell.chrome}::${cell.sha}::${cell.iteration}`),
  );
}

export function computeAppendRuns(
  config: Config,
  resolvedRefs: ResolvedRef[],
  existingRuns: RunMeta[],
  appendCount: number,
  chromeFilter?: string[],
  refsFilter?: string[],
): PendingRun[] {
  const runs: PendingRun[] = [];
  const versions = chromeFilter ?? config.chrome.versions;
  const refs = refsFilter
    ? resolvedRefs.filter((r) => refsFilter.includes(r.ref))
    : resolvedRefs;

  for (const chromeVersion of versions) {
    for (const resolved of refs) {
      // Find the max iteration index for this cell
      const cellRuns = existingRuns.filter(
        (r) => r.chrome === chromeVersion && r.sha === resolved.sha,
      );
      const maxIteration = cellRuns.length > 0
        ? Math.max(...cellRuns.map((r) => r.iteration))
        : -1;

      const startIteration = maxIteration + 1;
      for (let i = 0; i < appendCount; i++) {
        runs.push({
          chrome: chromeVersion,
          ref: resolved.ref,
          sha: resolved.sha,
          iteration: startIteration + i,
        });
      }
    }
  }
  return runs;
}

export interface CellStatus {
  chrome: string;
  ref: string;
  sha: string;
  successCount: number;
  failedCount: number;
  target: number;
}

export function computeStatus(
  config: Config,
  resolvedRefs: ResolvedRef[],
  existingRuns: RunMeta[],
): CellStatus[] {
  const cells: CellStatus[] = [];
  for (const chromeVersion of config.chrome.versions) {
    for (const resolved of resolvedRefs) {
      const cellRuns = existingRuns.filter(
        (r) => r.chrome === chromeVersion && r.sha === resolved.sha,
      );
      const successCount = cellRuns.filter((r) => r.exitCode === 0).length;
      const failedCount = cellRuns.filter((r) => r.exitCode !== 0).length;

      cells.push({
        chrome: chromeVersion,
        ref: resolved.ref,
        sha: resolved.sha,
        successCount,
        failedCount,
        target: config.iterations,
      });
    }
  }
  return cells;
}
