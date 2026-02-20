/**
 * Formats the `status --failures` output.
 * Groups failures by cell, shows dot sequences, stderr excerpts,
 * pattern detection, and retry commands.
 */

import type { Config } from "./config.js";
import type { RunMeta } from "./matrix.js";

interface CellFailureInfo {
  chrome: string;
  ref: string;
  sha: string;
  total: number;
  passed: number;
  failed: number;
  runs: RunMeta[];
}

export function formatFailures(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>,
  stderrMap?: Map<string, string>
): string {
  // Build per-cell stats from runs that match current SHAs
  const currentShas = new Set<string>();
  for (const [, sha] of shaMap) {
    currentShas.add(sha);
  }

  const cellMap = new Map<string, CellFailureInfo>();

  for (const run of runs) {
    if (!currentShas.has(run.sha)) continue;

    const key = `${run.chrome}|${run.sha}`;
    let cell = cellMap.get(key);
    if (!cell) {
      cell = {
        chrome: run.chrome,
        ref: run.ref,
        sha: run.sha,
        total: config.iterations,
        passed: 0,
        failed: 0,
        runs: [],
      };
      cellMap.set(key, cell);
    }
    cell.runs.push(run);
    if (run.exitCode === 0) {
      cell.passed++;
    } else {
      cell.failed++;
    }
  }

  // Count total failures
  const failedCells = [...cellMap.values()].filter((c) => c.failed > 0);
  const totalFailures = failedCells.reduce((sum, c) => sum + c.failed, 0);

  if (totalFailures === 0) {
    const totalRuns = runs.filter((r) => currentShas.has(r.sha)).length;
    return `No failures. All ${totalRuns} iterations passed.`;
  }

  const lines: string[] = [];

  // Header
  const cellWord = failedCells.length === 1 ? "1 cell" : `${failedCells.length} cells`;
  const failWord = totalFailures === 1 ? "1 failure" : `${totalFailures} failures`;
  lines.push(`${failWord} in ${cellWord}`);
  lines.push("");

  // Per-cell details
  for (const cell of failedCells) {
    // Sort runs by iteration
    cell.runs.sort((a, b) => a.iteration - b.iteration);

    // Cell header: Chrome VERSION x REF (SHA)
    const chromeLabel = `Chrome ${cell.chrome}`;
    const refLabel = cell.ref;
    const shaLabel = `(${cell.sha.slice(0, 7)})`;
    const failedOf = `${cell.failed} of ${cell.total} failed`;
    lines.push(`${chromeLabel} x ${refLabel} ${shaLabel}    ${failedOf}`);

    // Dot sequence
    const dots = cell.runs
      .map((r) => (r.exitCode === 0 ? "●" : "✗"))
      .join("");
    lines.push(
      `  ${dots}  ${cell.passed}/${cell.total} passed, ${cell.failed} failed`
    );

    // Failed run details
    const failedRuns = cell.runs.filter((r) => r.exitCode !== 0);

    // Check if all stderr are identical (for deduplication)
    let allStderrIdentical = false;
    if (stderrMap && failedRuns.length > 1) {
      const stderrs = failedRuns.map((r) => stderrMap.get(r.id) ?? "");
      allStderrIdentical =
        stderrs.length > 0 && stderrs.every((s) => s === stderrs[0]);
    }

    for (const run of failedRuns) {
      lines.push(
        `  #${run.iteration}  exit:${run.exitCode}  ${run.durationMs}ms  run:${run.id}`
      );
    }

    // Stderr
    if (stderrMap) {
      if (allStderrIdentical && failedRuns.length > 1) {
        const stderr = stderrMap.get(failedRuns[0].id) ?? "";
        if (stderr) {
          lines.push(`  stderr (both identical):`);
          const stderrLines = stderr.trim().split("\n").slice(-3);
          for (const sl of stderrLines) {
            lines.push(`    ${sl}`);
          }
        }
      } else {
        for (const run of failedRuns) {
          const stderr = stderrMap.get(run.id);
          if (stderr) {
            lines.push(`  stderr:`);
            const stderrLines = stderr.trim().split("\n").slice(-3);
            for (const sl of stderrLines) {
              lines.push(`    ${sl}`);
            }
          }
        }
      }
    }

    // Output file path
    if (!allStderrIdentical && failedRuns.length === 1) {
      lines.push(
        `  output: .chrome-ranger/output/${failedRuns[0].id}.stderr`
      );
    }

    lines.push("");
  }

  // Pattern detection
  const failedRefs = new Set(failedCells.map((c) => c.ref));
  if (failedRefs.size === 1) {
    const ref = [...failedRefs][0];
    lines.push(`Pattern: all failures on ref ${ref}`);
  } else if (failedRefs.size < failedCells.length) {
    // Multiple refs but some clustering
    const refCounts = new Map<string, number>();
    for (const cell of failedCells) {
      refCounts.set(cell.ref, (refCounts.get(cell.ref) ?? 0) + cell.failed);
    }
    const sorted = [...refCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topRef = sorted[0];
    if (topRef[1] > totalFailures / 2) {
      lines.push(
        `Pattern: ${topRef[1]} of ${totalFailures} failures on ref ${topRef[0]}`
      );
    }
  }

  // Retry command
  const retryRefs = [...failedRefs];
  if (retryRefs.length === 1) {
    lines.push(`\nRetry: chrome-ranger run --refs ${retryRefs[0]}`);
  } else {
    const refsStr = retryRefs.map((r) => `--refs ${r}`).join(" ");
    lines.push(`\nRetry all: chrome-ranger run ${refsStr}`);
  }

  return lines.join("\n");
}
