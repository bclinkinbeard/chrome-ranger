import type { MatrixCell, ResolvedRef, RunMeta } from "./types.js";

export function generateMatrix(
  chromeVersions: string[],
  resolvedRefs: ResolvedRef[],
  iterations: number,
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const chrome of chromeVersions) {
    for (const { ref, sha } of resolvedRefs) {
      for (let i = 0; i < iterations; i++) {
        cells.push({ chrome, ref, sha, iteration: i });
      }
    }
  }
  return cells;
}

export function computePending(
  matrix: MatrixCell[],
  completedRuns: RunMeta[],
): MatrixCell[] {
  const completedSet = new Set<string>();
  for (const run of completedRuns) {
    if (run.exitCode === 0) {
      completedSet.add(cellKey(run.chrome, run.sha, run.iteration));
    }
  }

  return matrix.filter(
    (cell) => !completedSet.has(cellKey(cell.chrome, cell.sha, cell.iteration)),
  );
}

export function filterMatrix(
  matrix: MatrixCell[],
  chromeFilter?: string[],
  refsFilter?: string[],
): MatrixCell[] {
  let result = matrix;

  if (chromeFilter && chromeFilter.length > 0) {
    const filterSet = new Set(chromeFilter);
    result = result.filter((cell) => filterSet.has(cell.chrome));
  }

  if (refsFilter && refsFilter.length > 0) {
    const filterSet = new Set(refsFilter);
    result = result.filter((cell) => filterSet.has(cell.ref));
  }

  return result;
}

export function computeAppend(
  chromeVersions: string[],
  resolvedRefs: ResolvedRef[],
  existingRuns: RunMeta[],
  appendCount: number,
  chromeFilter?: string[],
  refsFilter?: string[],
): MatrixCell[] {
  // Find max iteration per (chrome, sha) cell
  const maxIterations = new Map<string, number>();
  for (const run of existingRuns) {
    const key = `${run.chrome}\0${run.sha}`;
    const current = maxIterations.get(key) ?? -1;
    if (run.iteration > current) {
      maxIterations.set(key, run.iteration);
    }
  }

  const cells: MatrixCell[] = [];
  for (const chrome of chromeVersions) {
    if (chromeFilter && chromeFilter.length > 0 && !chromeFilter.includes(chrome)) {
      continue;
    }
    for (const { ref, sha } of resolvedRefs) {
      if (refsFilter && refsFilter.length > 0 && !refsFilter.includes(ref)) {
        continue;
      }
      const key = `${chrome}\0${sha}`;
      const maxIter = maxIterations.get(key) ?? -1;
      const startIter = maxIter + 1;
      for (let i = 0; i < appendCount; i++) {
        cells.push({ chrome, ref, sha, iteration: startIter + i });
      }
    }
  }

  return cells;
}

function cellKey(chrome: string, sha: string, iteration: number): string {
  return `${chrome}\0${sha}\0${iteration}`;
}
