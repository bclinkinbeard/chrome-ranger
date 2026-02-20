/**
 * Status display formatters: bar view and compact heat map view.
 * Replaces the original formatStatus in status.ts.
 */

import type { Config } from "./config.js";
import type { RunMeta } from "./matrix.js";
import { renderBar, renderCellSuffix, heatmapGlyph } from "./render.js";

interface CellStats {
  passed: number;
  failed: number;
  /** Ordered list of exit codes by iteration index */
  iterations: Map<number, number>;
}

function buildCellStats(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>
): {
  stats: Map<string, CellStats>;
  totalRuns: number;
  totalFailed: number;
} {
  const currentShas = new Set([...shaMap.values()]);
  const stats = new Map<string, CellStats>();

  // Initialize all cells
  for (const chrome of config.chrome.versions) {
    for (const ref of config.code.refs) {
      const sha = shaMap.get(ref) ?? "";
      const key = `${chrome}|${sha}`;
      if (!stats.has(key)) {
        stats.set(key, { passed: 0, failed: 0, iterations: new Map() });
      }
    }
  }

  let totalRuns = 0;
  let totalFailed = 0;

  for (const run of runs) {
    if (!currentShas.has(run.sha)) continue;
    totalRuns++;

    const key = `${run.chrome}|${run.sha}`;
    const cell = stats.get(key);
    if (!cell) continue;

    cell.iterations.set(run.iteration, run.exitCode);
    if (run.exitCode === 0) {
      cell.passed++;
    } else {
      cell.failed++;
      totalFailed++;
    }
  }

  return { stats, totalRuns, totalFailed };
}

/**
 * Render a bar that shows pass/fail at exact iteration positions.
 * Unlike renderBar which puts passes first then failures,
 * this version preserves iteration order.
 */
function renderPositionalBar(
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

export function formatStatusBars(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>
): string {
  const { versions } = config.chrome;
  const { refs } = config.code;
  const { stats, totalRuns, totalFailed } = buildCellStats(config, runs, shaMap);

  const lines: string[] = [];

  // Render rows
  for (const version of versions) {
    const label = ` chrome@${version.split(".")[0]}`;
    const cells: string[] = [];

    for (const ref of refs) {
      const sha = shaMap.get(ref) ?? "";
      const key = `${version}|${sha}`;
      const cell = stats.get(key) ?? { passed: 0, failed: 0, iterations: new Map() };

      const bar = renderPositionalBar(cell.iterations, config.iterations);
      const suffix = renderCellSuffix(cell.passed, cell.failed, config.iterations);
      const fraction =
        cell.passed >= config.iterations && cell.failed === 0 && config.iterations >= 10
          ? `${cell.passed}`
          : `${cell.passed}/${config.iterations}`;

      const cellStr = suffix
        ? `${ref} ${bar} ${fraction} ${suffix}`
        : `${ref} ${bar} ${fraction}`;
      cells.push(cellStr);
    }

    lines.push(`${label}  ${cells.join("   ")}`);
  }

  lines.push("");

  // Summary
  const totalTarget = versions.length * refs.length * config.iterations;
  const totalPassed = totalRuns - totalFailed;

  if (totalRuns === 0) {
    lines.push("No runs recorded.");
  } else if (totalFailed > 0) {
    const failedCells = [...stats.values()].filter((c) => c.failed > 0).length;
    lines.push(
      `${totalPassed}/${totalTarget} complete (${totalFailed} failed in ${failedCells} cell${failedCells > 1 ? "s" : ""})`
    );
    // List affected cells
    const affectedCells: string[] = [];
    for (const version of versions) {
      for (const ref of refs) {
        const sha = shaMap.get(ref) ?? "";
        const key = `${version}|${sha}`;
        const cell = stats.get(key);
        if (cell && cell.failed > 0) {
          affectedCells.push(`chrome@${version.split(".")[0]} x ${ref}`);
        }
      }
    }
    if (affectedCells.length > 0) {
      lines.push(`Failures in: ${affectedCells.join(", ")}`);
    }
  } else {
    lines.push(`${totalPassed}/${totalTarget} complete (0 failed)`);
  }

  return lines.join("\n");
}

export function formatStatusCompact(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>
): string {
  const { versions } = config.chrome;
  const { refs } = config.code;
  const { stats, totalRuns, totalFailed } = buildCellStats(config, runs, shaMap);

  const lines: string[] = [];

  // Column headers
  const labelWidth = Math.max(
    ...versions.map((v) => `chrome@${v.split(".")[0]}`.length),
    10
  );
  const colWidth = Math.max(...refs.map((r) => r.length), 6);

  const header =
    " ".repeat(labelWidth + 2) +
    refs.map((r) => r.padEnd(colWidth + 2)).join("");
  lines.push(header);

  // Rows
  for (const version of versions) {
    const label = `chrome@${version.split(".")[0]}`.padEnd(labelWidth + 2);
    const cells = refs.map((ref) => {
      const sha = shaMap.get(ref) ?? "";
      const key = `${version}|${sha}`;
      const cell = stats.get(key) ?? { passed: 0, failed: 0, iterations: new Map() };
      const glyph = heatmapGlyph(cell.passed, cell.failed, config.iterations);
      return glyph.padEnd(colWidth + 2);
    });

    lines.push(label + cells.join(""));
  }

  lines.push("");

  // Summary
  const totalTarget = versions.length * refs.length * config.iterations;
  const totalPassed = totalRuns - totalFailed;

  if (totalRuns === 0) {
    lines.push("No runs recorded.");
  } else if (totalFailed > 0) {
    const failedCells = [...stats.values()].filter((c) => c.failed > 0).length;
    lines.push(
      `  ${totalPassed}/${totalTarget} complete, ${totalFailed} failed in ${failedCells} cell${failedCells > 1 ? "s" : ""}`
    );
  } else if (totalPassed >= totalTarget) {
    lines.push(`  ${totalPassed}/${totalTarget} complete, all passed`);
  } else {
    lines.push(`  ${totalPassed}/${totalTarget} complete (${Math.round((totalPassed / totalTarget) * 100)}%)`);
  }

  lines.push("");
  lines.push("█ complete  ▓ >50%  ▒ started  ░ empty  ✗ has failures");

  return lines.join("\n");
}
