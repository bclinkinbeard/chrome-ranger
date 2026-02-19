import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { findConfigPath, parseConfig } from "../config.js";
import { runsJsonlPath } from "../storage.js";
import { loadRuns } from "../runs.js";
import { computeStatus } from "../matrix.js";
import { log, logError } from "../log.js";

export function statusCommand(cwd: string): void {
  const configPath = findConfigPath(cwd);
  let config;
  try {
    config = parseConfig(configPath);
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const repoDir = resolve(cwd, config.code.repo);
  const runsPath = runsJsonlPath(cwd);

  let resolvedRefs;
  try {
    resolvedRefs = config.code.refs.map((ref) => {
      const sha = (
        execSync(`git rev-parse "${ref}"`, {
          cwd: repoDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }) as string
      ).trim();
      const dirName = ref.replace(/\//g, "-");
      return {
        ref,
        sha,
        worktreeDir: resolve(cwd, ".chrome-ranger", "worktrees", dirName),
      };
    });
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const existingRuns = loadRuns(runsPath);
  const cells = computeStatus(config, resolvedRefs, existingRuns);

  const refs = resolvedRefs;
  const versions = config.chrome.versions;

  // Column headers: ref (shortSha)
  const colHeaders = refs.map(
    (r) => `${r.ref} (${r.sha.substring(0, 7)})`,
  );

  // Row labels: Chrome <version>
  const rowLabels = versions.map((v) => `Chrome ${v}`);

  // Compute column widths
  const colWidths = colHeaders.map((h) => h.length);
  const rowLabelWidth = Math.max(...rowLabels.map((l) => l.length));

  // Build cell values
  const cellValues: string[][] = [];
  for (let r = 0; r < versions.length; r++) {
    const row: string[] = [];
    for (let c = 0; c < refs.length; c++) {
      const cell = cells.find(
        (s) => s.chrome === versions[r] && s.ref === refs[c].ref,
      );
      if (!cell) {
        row.push(`0/${config.iterations}`);
      } else {
        const label = `${cell.successCount}/${cell.target}`;
        if (cell.successCount >= cell.target) {
          row.push(`${label} \u2713`);
        } else if (cell.failedCount > 0) {
          row.push(`${label} \u2717 (${cell.failedCount} failed)`);
        } else if (cell.successCount > 0) {
          row.push(`${label} ...`);
        } else {
          row.push(label);
        }
      }
      const valLen = row[row.length - 1].length;
      if (valLen > colWidths[c]) {
        colWidths[c] = valLen;
      }
    }
    cellValues.push(row);
  }

  // Print header row
  const headerPad = " ".repeat(rowLabelWidth + 2);
  const headerLine =
    headerPad +
    colHeaders.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  log(headerLine);

  // Print data rows
  for (let r = 0; r < versions.length; r++) {
    const rowLabel = rowLabels[r].padEnd(rowLabelWidth);
    const vals = cellValues[r]
      .map((v, i) => v.padEnd(colWidths[i]))
      .join("  ");
    log(`${rowLabel}  ${vals}`);
  }
}
