/**
 * Live display manager for the run command.
 * Handles both TTY (pinned header + scrolling log) and non-TTY (sequential log) modes.
 */

import { formatLogLine, renderProgressLine, renderWorkerLine, type WorkerInfo } from "./render.js";
import { renderBar, renderCellSuffix } from "./render.js";

export interface DisplayConfig {
  chromeVersions: string[];
  refs: string[];
  iterations: number;
  warmupTotal: number;
  totalIterations: number;
  workers: number;
  isTTY: boolean;
  columns?: number;
  rows?: number;
}

export interface IterationResult {
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
  durationMs: number;
  exitCode: number;
  stderr?: string;
}

interface WarmupResult {
  chrome: string;
  ref: string;
  sha: string;
  durationMs: number;
}

interface CellState {
  passed: number;
  failed: number;
  iterations: Map<number, number>;
}

export class LiveDisplay {
  private config: DisplayConfig;
  private write: (msg: string) => void;
  private cells = new Map<string, CellState>();
  private activeWorkers = new Map<number, { label: string; startTime: number }>();
  private _completed = 0;
  private _failed = 0;
  private warmupCompleted = 0;
  private startTime = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private headerHeight = 0;

  constructor(config: DisplayConfig, write: (msg: string) => void) {
    this.config = config;
    this.write = write;

    // Initialize cell states
    for (const chrome of config.chromeVersions) {
      for (const ref of config.refs) {
        this.cells.set(`${chrome}|${ref}`, {
          passed: 0,
          failed: 0,
          iterations: new Map(),
        });
      }
    }

    if (config.isTTY) {
      this.setupTTY();
    }
  }

  get completed(): number {
    return this._completed;
  }

  get failed(): number {
    return this._failed;
  }

  getCellState(chrome: string, ref: string): { passed: number; failed: number } {
    const state = this.cells.get(`${chrome}|${ref}`);
    return state
      ? { passed: state.passed, failed: state.failed }
      : { passed: 0, failed: 0 };
  }

  setWorkerActive(id: number, label: string): void {
    this.activeWorkers.set(id, { label, startTime: Date.now() });
  }

  setWorkerIdle(id: number): void {
    this.activeWorkers.delete(id);
  }

  getActiveWorkers(): WorkerInfo[] {
    const now = Date.now();
    const workers: WorkerInfo[] = [];
    for (const [id, w] of this.activeWorkers) {
      const elapsedSec = ((now - w.startTime) / 1000).toFixed(1);
      workers.push({ id, label: w.label, elapsed: `${elapsedSec}s` });
    }
    return workers;
  }

  onWarmupComplete(result: WarmupResult): void {
    this.warmupCompleted++;
    const major = result.chrome.split(".")[0];
    const label = `chrome@${major} x ${result.ref} (${result.sha.slice(0, 7)})`;

    if (this.config.isTTY) {
      this.renderHeader();
      this.writeLogLine(`  [warmup] ${label}    ${result.durationMs}ms`);
    } else {
      this.write(`  [warmup] ${label}    ${result.durationMs}ms`);
    }
  }

  onIterationComplete(result: IterationResult): void {
    this._completed++;
    if (result.exitCode !== 0) {
      this._failed++;
    }

    // Update cell state
    const key = `${result.chrome}|${result.ref}`;
    const cell = this.cells.get(key);
    if (cell) {
      cell.iterations.set(result.iteration, result.exitCode);
      if (result.exitCode === 0) {
        cell.passed++;
      } else {
        cell.failed++;
      }
    }

    // Format log line
    const major = result.chrome.split(".")[0];
    const label = `chrome@${major} x ${result.ref} (${result.sha.slice(0, 7)})`;
    const logLine = formatLogLine(
      this._completed,
      this.config.totalIterations,
      label,
      result.iteration,
      result.durationMs,
      result.exitCode,
      result.stderr
    );

    if (this.config.isTTY) {
      this.renderHeader();
      this.writeLogLine(logLine);
    } else {
      this.write(logLine);
    }
  }

  onComplete(wallTimeMs: number): void {
    this.stopTimer();

    const duration = formatDuration(wallTimeMs);
    const suffix = this._failed > 0 ? ` (${this._failed} failed)` : "";

    if (this.config.isTTY) {
      // Reset scroll region, render final header
      this.write("\x1b[r"); // reset scroll region
      this.write("\x1b[1;1H"); // move to home
      this.renderFinalHeader(duration);
      // Move cursor below the last log line
      this.write(`\x1b[${this.config.rows ?? 24};1H`);
    }

    this.write(
      `\n${this.config.totalIterations} runs logged to .chrome-ranger/runs.jsonl${suffix}`
    );
  }

  destroy(): void {
    this.stopTimer();
  }

  // --- TTY internals ---

  private setupTTY(): void {
    // Calculate header height
    const workerRows = Math.ceil(this.config.workers / 2);
    this.headerHeight =
      1 + // progress line
      1 + // blank
      this.config.chromeVersions.length + // matrix rows
      1 + // blank
      workerRows + // worker lines
      1; // separator

    const rows = this.config.rows ?? 24;
    // Set scroll region below header
    this.write(`\x1b[${this.headerHeight + 1};${rows}r`);
    // Move cursor to scroll region
    this.write(`\x1b[${this.headerHeight + 1};1H`);

    // Start timer for worker elapsed updates
    this.timer = setInterval(() => this.renderHeader(), 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private renderHeader(): void {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const progress = renderProgressLine(
      this._completed,
      this.config.totalIterations,
      elapsed,
      this._failed
    );

    const lines: string[] = [];
    lines.push(progress);
    lines.push("");

    // Matrix rows
    for (const chrome of this.config.chromeVersions) {
      const major = chrome.split(".")[0];
      const label = ` chrome@${major}`;
      const cells: string[] = [];

      for (const ref of this.config.refs) {
        const key = `${chrome}|${ref}`;
        const state = this.cells.get(key) ?? {
          passed: 0,
          failed: 0,
          iterations: new Map(),
        };

        const bar = this.renderPositionalBar(state.iterations, this.config.iterations);
        const suffix = renderCellSuffix(state.passed, state.failed, this.config.iterations);
        const fraction =
          state.passed >= this.config.iterations &&
          state.failed === 0 &&
          this.config.iterations >= 10
            ? `${state.passed}`
            : `${state.passed}/${this.config.iterations}`;

        const cellStr = suffix
          ? `${ref} ${bar} ${fraction} ${suffix}`
          : `${ref} ${bar} ${fraction}`;
        cells.push(cellStr);
      }

      lines.push(`${label}  ${cells.join("   ")}`);
    }

    lines.push("");

    // Workers
    const workers = this.getActiveWorkers();
    for (let i = 0; i < workers.length; i += 2) {
      const pair = workers.slice(i, i + 2);
      lines.push(renderWorkerLine(pair));
    }

    lines.push("---");

    // Write header with ANSI cursor control
    this.write("\x1b[s"); // save cursor
    this.write("\x1b[1;1H"); // move to home
    for (const line of lines) {
      this.write(line + "\x1b[K\n"); // write + clear to end of line
    }
    this.write("\x1b[u"); // restore cursor
  }

  private renderFinalHeader(duration: string): void {
    const progress = `chrome-ranger run  ${this._completed}/${this.config.totalIterations}  100%  ${duration}`;
    const failSuffix = this._failed > 0 ? `  ${this._failed} failed` : "";

    const lines: string[] = [];
    lines.push(progress + failSuffix);
    lines.push("");

    // Matrix rows (final state)
    for (const chrome of this.config.chromeVersions) {
      const major = chrome.split(".")[0];
      const label = ` chrome@${major}`;
      const cells: string[] = [];

      for (const ref of this.config.refs) {
        const key = `${chrome}|${ref}`;
        const state = this.cells.get(key) ?? {
          passed: 0,
          failed: 0,
          iterations: new Map(),
        };

        const bar = this.renderPositionalBar(state.iterations, this.config.iterations);
        const suffix = renderCellSuffix(state.passed, state.failed, this.config.iterations);
        const fraction =
          state.passed >= this.config.iterations &&
          state.failed === 0 &&
          this.config.iterations >= 10
            ? `${state.passed}`
            : `${state.passed}/${this.config.iterations}`;

        const cellStr = suffix
          ? `${ref} ${bar} ${fraction} ${suffix}`
          : `${ref} ${bar} ${fraction}`;
        cells.push(cellStr);
      }

      lines.push(`${label}  ${cells.join("   ")}`);
    }

    lines.push("");

    // Summary (replaces workers)
    if (this._failed > 0) {
      const failedCells = [...this.cells.values()].filter((c) => c.failed > 0).length;
      lines.push(
        ` Done. ${this._completed} runs in ${duration}, ${this._failed} failed in ${failedCells} cell${failedCells > 1 ? "s" : ""}.`
      );
      lines.push(` See: chrome-ranger status --failures`);
    } else {
      lines.push(` Done. ${this._completed} runs in ${duration}, all passed.`);
      lines.push(` Logged to .chrome-ranger/runs.jsonl`);
    }
    lines.push("===");

    for (const line of lines) {
      this.write(line + "\x1b[K\n");
    }
    this.write("\x1b[J"); // clear to end of screen
  }

  private writeLogLine(line: string): void {
    // Write at current cursor position in scroll region
    this.write(line + "\n");
  }

  private renderPositionalBar(
    iterations: Map<number, number>,
    total: number
  ): string {
    const chars: string[] = [];
    for (let i = 0; i < total; i++) {
      const exitCode = iterations.get(i);
      if (exitCode === undefined) {
        chars.push("░");
      } else if (exitCode === 0) {
        chars.push("█");
      } else {
        chars.push("✗");
      }
    }
    return chars.join("");
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    return `0:${String(totalSec).padStart(2, "0")}`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) {
    return `${min}m ${String(sec).padStart(2, "0")}s`;
  }
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
}
