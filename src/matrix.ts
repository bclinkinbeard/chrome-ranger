import type { Config } from "./config.js";

export interface MatrixCell {
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
}

export interface RunMeta {
  id: string;
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
  timestamp: string;
  durationMs: number;
  exitCode: number;
}

export function buildMatrix(
  config: Config,
  shaMap: Map<string, string>
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const chrome of config.chrome.versions) {
    for (const ref of config.code.refs) {
      const sha = shaMap.get(ref)!;
      for (let i = 0; i < config.iterations; i++) {
        cells.push({ chrome, ref, sha, iteration: i });
      }
    }
  }
  return cells;
}

export function computePending(
  matrix: MatrixCell[],
  runs: RunMeta[]
): MatrixCell[] {
  const successSet = new Set<string>();
  for (const run of runs) {
    if (run.exitCode === 0) {
      successSet.add(cellKey(run));
    }
  }
  return matrix.filter((cell) => !successSet.has(cellKey(cell)));
}

function cellKey(cell: {
  chrome: string;
  sha: string;
  iteration: number;
}): string {
  return `${cell.chrome}|${cell.sha}|${cell.iteration}`;
}
