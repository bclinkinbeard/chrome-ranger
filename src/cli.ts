import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { parseConfig } from "./config.js";
import { initConfig } from "./init.js";
import { executeRun } from "./runner.js";
import { loadRuns } from "./runs.js";
import { formatStatusBars, formatStatusCompact } from "./status-display.js";
import { formatFailures } from "./failures.js";
import { formatStatusJson } from "./status-json.js";
import { resolveRef } from "./worktree.js";
import { listChromeVersions, cacheClean, getCacheDir } from "./chrome.js";
import { cleanWorktrees } from "./worktree.js";
import { installSignalHandlers } from "./signal.js";

const log = (msg: string) => process.stderr.write(msg + "\n");

function loadConfigFromDisk(dir: string) {
  const configPath = path.join(dir, "chrome-ranger.yaml");
  if (!fs.existsSync(configPath)) {
    log(`error: chrome-ranger.yaml not found. Run 'chrome-ranger init' to create one.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    return parseConfig(raw);
  } catch (err) {
    log(`error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const program = new Command();

program
  .name("chrome-ranger")
  .description(
    "CLI orchestrator for running scripts against a matrix of Chrome versions and git refs"
  )
  .version("0.1.0");

// init
program
  .command("init")
  .description("Scaffold chrome-ranger.yaml config file")
  .option("--force", "Overwrite existing config", false)
  .action(async (opts) => {
    try {
      await initConfig(process.cwd(), opts.force);
      log("Created chrome-ranger.yaml");
    } catch (err) {
      log(`${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// run
program
  .command("run")
  .description("Execute matrix runs")
  .option("--chrome <versions...>", "Only run specific Chrome versions")
  .option("--refs <refs...>", "Only run specific refs")
  .option("--append <n>", "Add N more runs to targeted cells", parseInt)
  .option("--replace", "Clear and re-run targeted cells", false)
  .action(async (opts) => {
    const config = loadConfigFromDisk(process.cwd());
    const signalCleanup = installSignalHandlers();

    try {
      await executeRun({
        config,
        projectDir: process.cwd(),
        options: {
          chrome: opts.chrome,
          refs: opts.refs,
          append: opts.append,
          replace: opts.replace,
        },
        log,
      });
    } catch (err) {
      log(`error: ${err instanceof Error ? err.message : err}`);
      if (process.env.DEBUG === "chrome-ranger" && err instanceof Error) {
        log(err.stack ?? "");
      }
      process.exit(1);
    } finally {
      signalCleanup.uninstall();
    }
  });

// status
program
  .command("status")
  .description("Show matrix completion status")
  .option("--failures", "Show detailed failure report", false)
  .option("--json", "Output as JSON to stdout", false)
  .option("--compact", "Show compact heat map view", false)
  .action(async (opts) => {
    const config = loadConfigFromDisk(process.cwd());
    const projectDir = process.cwd();
    const jsonlPath = path.join(projectDir, ".chrome-ranger", "runs.jsonl");
    const outputDir = path.join(projectDir, ".chrome-ranger", "output");
    const runs = loadRuns(jsonlPath);

    // Resolve SHAs for display
    const shaMap = new Map<string, string>();
    for (const ref of config.code.refs) {
      try {
        const sha = await resolveRef(config.code.repo, ref);
        shaMap.set(ref, sha);
      } catch {
        shaMap.set(ref, "???????");
      }
    }

    if (opts.json) {
      const result = formatStatusJson(config, runs, shaMap);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (opts.failures) {
      // Load stderr files for failed runs
      const stderrMap = new Map<string, string>();
      for (const run of runs) {
        if (run.exitCode !== 0) {
          const stderrPath = path.join(outputDir, `${run.id}.stderr`);
          try {
            stderrMap.set(run.id, fs.readFileSync(stderrPath, "utf-8"));
          } catch {
            // stderr file may not exist
          }
        }
      }
      log(formatFailures(config, runs, shaMap, stderrMap));
    } else if (opts.compact) {
      log(formatStatusCompact(config, runs, shaMap));
    } else {
      log(formatStatusBars(config, runs, shaMap));
    }
  });

// list-chrome
program
  .command("list-chrome")
  .description("List available Chrome versions")
  .option("--latest <n>", "Show only the latest N versions", parseInt)
  .option("--since <date>", "Show versions since date")
  .action(async (opts) => {
    try {
      const versions = await listChromeVersions({
        latest: opts.latest,
        since: opts.since,
      });
      for (const v of versions) {
        log(v);
      }
    } catch (err) {
      log(`error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// cache clean
const cache = program.command("cache").description("Chrome cache management");
cache
  .command("clean")
  .description("Remove all cached Chrome binaries")
  .action(async () => {
    const config = loadConfigFromDisk(process.cwd());
    const cacheDir = getCacheDir(config.chrome.cache_dir);
    await cacheClean(cacheDir);
    log(`Cleaned cache at ${cacheDir}`);
  });

// clean (worktrees)
program
  .command("clean")
  .description("Remove all worktrees")
  .action(async () => {
    const config = loadConfigFromDisk(process.cwd());
    const worktreeDir = path.join(process.cwd(), ".chrome-ranger", "worktrees");
    await cleanWorktrees(worktreeDir, config.code.repo);
    log("Cleaned worktrees");
  });

program.parse();
