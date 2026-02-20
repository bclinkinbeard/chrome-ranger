/**
 * Pure rendering functions for the status visualization.
 * No I/O, no ANSI codes -- just string building.
 */

const FILLED = "█";
const EMPTY = "░";
const FAIL_MARK = "✗";
const CHECK = "✓";

/** Render a progress bar: filled blocks, then failure marks, then empty blocks. */
export function renderBar(passed: number, failed: number, total: number): string {
  const remaining = total - passed - failed;
  return FILLED.repeat(passed) + FAIL_MARK.repeat(failed) + EMPTY.repeat(remaining);
}

/** Render cell suffix: ✓ for complete, ✗N for failures, empty for in-progress. */
export function renderCellSuffix(passed: number, failed: number, total: number): string {
  if (failed > 0) {
    return `${FAIL_MARK}${failed}`;
  }
  if (passed >= total) {
    return CHECK;
  }
  return "";
}

/** Render a full cell: bar + fraction + suffix. */
export function renderCell(passed: number, failed: number, total: number): string {
  const bar = renderBar(passed, failed, total);
  const suffix = renderCellSuffix(passed, failed, total);

  // Drop denominator for complete cells at scale (total >= 10)
  let fraction: string;
  if (passed >= total && failed === 0 && total >= 10) {
    fraction = `${passed}`;
  } else {
    fraction = `${passed}/${total}`;
  }

  return suffix ? `${bar} ${fraction} ${suffix}` : `${bar} ${fraction}`;
}

/** Format a scrolling log line for a completed iteration. */
export function formatLogLine(
  seq: number,
  total: number,
  cellLabel: string,
  iteration: number,
  durationMs: number,
  exitCode: number,
  stderr?: string
): string {
  const width = String(total).length;
  const prefix = `[${String(seq).padStart(width)}/${total}]`;

  let line = `  ${prefix} ${cellLabel} #${iteration}`;
  // Pad to align duration
  const pad = Math.max(1, 55 - line.length);
  line += " ".repeat(pad) + `${durationMs}ms`;

  if (exitCode !== 0) {
    line += "  FAIL";

    // Add inline stderr excerpt for failures
    if (stderr) {
      const lines = stderr.trim().split("\n");
      const lastTwo = lines.slice(-2);
      const indented = lastTwo.map((l) => " ".repeat(10 + prefix.length) + l).join("\n");
      line += "\n" + indented;
    }
  }

  return line;
}

/** Render the progress header line. */
export function renderProgressLine(
  done: number,
  total: number,
  elapsed: string,
  failed: number,
  warmup = false
): string {
  const pct = Math.round((done / total) * 100);
  const fraction = `${done}/${total}`;

  let line: string;
  if (warmup) {
    line = `chrome-ranger run  warmup ${fraction}  elapsed ${elapsed}`;
  } else {
    line = `chrome-ranger run  ${fraction}  ${pct}%  elapsed ${elapsed}`;
  }

  if (failed > 0) {
    line += `  ${failed} failed`;
  }

  return line;
}

export interface WorkerInfo {
  id: number;
  label: string;
  elapsed: string;
}

/** Render a worker status line (up to 2 workers per line). */
export function renderWorkerLine(workers: WorkerInfo[]): string {
  if (workers.length === 0) return "";

  const parts = workers.map((w) => {
    const wLabel = `w${w.id} ${w.label}`;
    return ` ${wLabel.padEnd(35)}${w.elapsed}`;
  });

  return parts.join("    ");
}

/** Return a single heat map glyph for a cell's state. */
export function heatmapGlyph(passed: number, failed: number, total: number): string {
  if (failed > 0) return FAIL_MARK;
  if (passed >= total) return FILLED;
  if (passed / total > 0.5) return "▓";
  if (passed > 0) return "▒";
  return EMPTY;
}
