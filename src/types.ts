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

export interface MatrixCell {
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
}

export interface ResolvedRef {
  ref: string;
  sha: string;
}

export interface Worktree {
  ref: string;
  sha: string;
  path: string;
}

export interface ChromeInstallation {
  version: string;
  executablePath: string;
}

export interface ChromeVersionInfo {
  version: string;
  revision: string;
  channel: string;
}

export interface IterationInput {
  id: string;
  command: string;
  chromeBin: string;
  chromeVersion: string;
  ref: string;
  sha: string;
  codeDir: string;
  iteration: number;
}

export interface IterationResult {
  id: string;
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
  timestamp: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SetupResult {
  ref: string;
  sha: string;
  success: boolean;
  durationMs: number;
  exitCode?: number;
}

export interface PoolTask {
  cell: MatrixCell;
  chromeBin: string;
  codeDir: string;
}

export interface PoolResult {
  total: number;
  completed: number;
  failed: number;
}

export interface WarmupTask {
  chrome: string;
  chromeBin: string;
  ref: string;
  sha: string;
  codeDir: string;
}

export interface WarmupResult {
  passed: Array<{ chrome: string; ref: string }>;
  failed: Array<{ chrome: string; ref: string; exitCode: number }>;
}

export interface RunOptions {
  configPath: string;
  projectDir: string;
  chromeFilter?: string[];
  refsFilter?: string[];
  appendCount?: number;
  replace?: boolean;
  stderr: NodeJS.WritableStream;
}

export interface RunSummary {
  total: number;
  completed: number;
  failed: number;
  skippedRefs: string[];
}
