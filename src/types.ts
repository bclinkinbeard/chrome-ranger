export interface Config {
  command: string;
  setup?: string;
  iterations: number;
  warmup: number;
  workers: number;
  chrome: {
    versions: string[];
    cache_dir?: string;
  };
  code: {
    repo: string;
    refs: string[];
  };
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

export interface ResolvedRef {
  ref: string;
  sha: string;
  worktreeDir: string;
}

export interface PendingRun {
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
}

export interface CellKey {
  chrome: string;
  sha: string;
}
