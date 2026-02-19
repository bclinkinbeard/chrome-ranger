import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadConfig } from "./config.js";
import { loadRuns } from "./runs.js";
import { resolveRef, cleanWorktrees } from "./worktrees.js";
import { listChromeVersions, cleanCache, resolveCacheDir } from "./chrome.js";
import { executeRun } from "./orchestrator.js";
import type { ResolvedRef } from "./types.js";

const program = new Command();

program
  .name("chrome-ranger")
  .description(
    "CLI orchestrator that runs arbitrary scripts against a matrix of Chrome versions × git refs",
  )
  .version("0.1.0");

// init
program
  .command("init")
  .description("Scaffold a chrome-ranger.yaml config file")
  .option("--force", "Overwrite existing config file")
  .action(async (opts: { force?: boolean }) => {
    const configPath = path.resolve("chrome-ranger.yaml");

    try {
      await fs.access(configPath);
      if (!opts.force) {
        process.stderr.write(
          "error: chrome-ranger.yaml already exists. Use --force to overwrite.\n",
        );
        process.exit(1);
      }
    } catch {
      // File doesn't exist — good
    }

    const scaffold = `command: npx playwright test
setup: npm ci
iterations: 5
warmup: 1
workers: 2

chrome:
  versions:
    - "REPLACE_WITH_VERSION"

code:
  repo: .
  refs:
    - main
`;

    await fs.writeFile(configPath, scaffold, "utf-8");
    process.stderr.write("Created chrome-ranger.yaml\n");
  });

// run
program
  .command("run")
  .description("Execute the matrix of Chrome versions × git refs")
  .option("--chrome <version...>", "Filter to specific Chrome versions")
  .option("--refs <ref...>", "Filter to specific refs")
  .option("--append <N>", "Add N additional iterations", parseInt)
  .option("--replace", "Clear targeted cells and re-run")
  .action(
    async (opts: {
      chrome?: string[];
      refs?: string[];
      append?: number;
      replace?: boolean;
    }) => {
      if (opts.append !== undefined && opts.replace) {
        process.stderr.write(
          "error: --append and --replace are mutually exclusive\n",
        );
        process.exit(1);
      }

      if (opts.append !== undefined && (isNaN(opts.append) || opts.append <= 0)) {
        process.stderr.write(
          "error: --append must be a positive integer\n",
        );
        process.exit(1);
      }

      const projectDir = process.cwd();
      const configPath = path.resolve("chrome-ranger.yaml");

      const result = await executeRun({
        configPath,
        projectDir,
        chromeFilter: opts.chrome,
        refsFilter: opts.refs,
        appendCount: opts.append,
        replace: opts.replace,
        stderr: process.stderr,
      });

      if (result.failed > 0 || result.skippedRefs.length > 0) {
        // Still exit 0 — failures are normal, data was collected
      }
    },
  );

// status
program
  .command("status")
  .description("Show matrix completion table")
  .action(async () => {
    const configPath = path.resolve("chrome-ranger.yaml");
    let config;
    try {
      config = await loadConfig(configPath);
    } catch (err: unknown) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    }

    const projectDir = process.cwd();

    // Resolve refs
    const resolvedRefs: ResolvedRef[] = [];
    for (const ref of config.code.refs) {
      try {
        const sha = await resolveRef(config.code.repo, ref);
        resolvedRefs.push({ ref, sha });
      } catch (err: unknown) {
        process.stderr.write(`error: ${(err as Error).message}\n`);
      }
    }

    // Load runs
    const runs = await loadRuns(projectDir);

    // Build completion matrix
    const target = config.iterations;

    // Compute column widths
    const colHeaders = resolvedRefs.map(
      (r) => `${r.ref} (${r.sha.slice(0, 7)})`,
    );
    const colWidths = colHeaders.map((h) => Math.max(h.length, 16));

    // Header row
    const labelWidth = Math.max(
      ...config.chrome.versions.map((v) => `Chrome ${v}`.length),
      14,
    );
    let header = " ".repeat(labelWidth + 2);
    for (let i = 0; i < colHeaders.length; i++) {
      header += colHeaders[i].padEnd(colWidths[i] + 2);
    }
    process.stderr.write(header + "\n");

    // Data rows
    for (const version of config.chrome.versions) {
      const label = `Chrome ${version}`.padEnd(labelWidth + 2);
      let row = label;

      for (const { ref, sha } of resolvedRefs) {
        const cellRuns = runs.filter(
          (r) => r.chrome === version && r.sha === sha,
        );
        const successful = cellRuns.filter((r) => r.exitCode === 0).length;
        const failedCount = cellRuns.filter((r) => r.exitCode !== 0).length;

        let cell: string;
        if (successful >= target) {
          cell = `${successful}/${target} ✓`;
        } else if (successful > 0 && failedCount > 0) {
          cell = `${successful}/${target} ✗ (${failedCount} failed)`;
        } else if (successful > 0) {
          cell = `${successful}/${target} ...`;
        } else {
          cell = `0/${target}`;
        }

        const colIdx = resolvedRefs.findIndex((r) => r.ref === ref);
        row += cell.padEnd(colWidths[colIdx] + 2);
      }

      process.stderr.write(row + "\n");
    }
  });

// list-chrome
program
  .command("list-chrome")
  .description("List available Chrome for Testing versions (stable channel)")
  .option("--latest <N>", "Show only the N most recent versions", parseInt)
  .option("--since <date>", "Show only versions released on or after this date")
  .action(async (opts: { latest?: number; since?: string }) => {
    try {
      let versions = await listChromeVersions();

      if (opts.latest && opts.latest > 0) {
        versions = versions.slice(0, opts.latest);
      }

      for (const v of versions) {
        process.stderr.write(`${v.version}\n`);
      }
    } catch (err: unknown) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// cache clean
program
  .command("cache")
  .description("Manage Chrome binary cache")
  .command("clean")
  .description("Remove all cached Chrome binaries")
  .action(async () => {
    let cacheDir: string;
    try {
      const configPath = path.resolve("chrome-ranger.yaml");
      const config = await loadConfig(configPath);
      cacheDir = resolveCacheDir(config.chrome.cache_dir);
    } catch {
      cacheDir = resolveCacheDir();
    }

    await cleanCache(cacheDir);
    process.stderr.write(`Removed cached Chrome binaries from ${cacheDir}\n`);
  });

// clean
program
  .command("clean")
  .description("Remove all worktrees")
  .action(async () => {
    const projectDir = process.cwd();
    await cleanWorktrees(projectDir);
    process.stderr.write(
      "Removed worktrees from .chrome-ranger/worktrees/\n",
    );
  });

program.parse();
