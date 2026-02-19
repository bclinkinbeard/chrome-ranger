import type { Config } from "./config.js";
import type { RunMeta } from "./matrix.js";

export function formatStatus(
  config: Config,
  runs: RunMeta[],
  shaMap: Map<string, string>
): string {
  const { versions } = config.chrome;
  const { refs } = config.code;
  const iterations = config.iterations;

  // Build cell stats: key = "chrome|sha", value = { success, failed }
  const cellStats = new Map<string, { success: number; failed: number }>();
  for (const run of runs) {
    const key = `${run.chrome}|${run.sha}`;
    let stats = cellStats.get(key);
    if (!stats) {
      stats = { success: 0, failed: 0 };
      cellStats.set(key, stats);
    }
    if (run.exitCode === 0) {
      stats.success++;
    } else {
      stats.failed++;
    }
  }

  // Build header row
  const refHeaders = refs.map((ref) => {
    const sha = shaMap.get(ref);
    return sha ? `${ref} (${sha.slice(0, 7)})` : ref;
  });

  // Calculate column widths
  const labelWidth = Math.max(
    ...versions.map((v) => `Chrome ${v.split(".")[0]}`.length),
    10
  );
  const colWidths = refHeaders.map((h) =>
    Math.max(h.length, 20)
  );

  // Build header
  const lines: string[] = [];
  const headerLine =
    " ".repeat(labelWidth + 2) +
    refHeaders.map((h, i) => h.padEnd(colWidths[i] + 2)).join("");
  lines.push(headerLine);

  // Build rows
  for (const version of versions) {
    const label = `Chrome ${version.split(".")[0]}`.padEnd(labelWidth + 2);
    const cells = refs.map((ref, i) => {
      const sha = shaMap.get(ref)!;
      const key = `${version}|${sha}`;
      const stats = cellStats.get(key) ?? { success: 0, failed: 0 };
      const count = stats.success;

      let cellStr: string;
      if (count >= iterations) {
        cellStr = `${count}/${iterations} ✓`;
      } else if (stats.failed > 0) {
        cellStr = `${count}/${iterations} ✗ (${stats.failed} failed)`;
      } else {
        cellStr = `${count}/${iterations}`;
      }

      return cellStr.padEnd(colWidths[i] + 2);
    });

    lines.push(label + cells.join(""));
  }

  return lines.join("\n");
}
