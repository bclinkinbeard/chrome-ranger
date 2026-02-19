import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { listChromeCommand } from "./commands/list-chrome.js";
import { cacheCleanCommand } from "./commands/cache-clean.js";
import { cleanCommand } from "./commands/clean.js";

const program = new Command();
const cwd = process.cwd();

program
  .name("chrome-ranger")
  .description(
    "CLI orchestrator that runs scripts against a matrix of Chrome versions × git refs",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold a chrome-ranger.yaml config file")
  .option("--force", "Overwrite existing config file", false)
  .action((options) => {
    initCommand(cwd, options.force);
  });

program
  .command("run")
  .description("Execute the matrix")
  .option(
    "--chrome <versions...>",
    "Only run for specific Chrome versions",
  )
  .option("--refs <refs...>", "Only run for specific refs")
  .option(
    "--append <count>",
    "Add N more runs to targeted cells",
    parseInt,
  )
  .option(
    "--replace",
    "Clear targeted cells before running",
    false,
  )
  .action(async (options) => {
    await runCommand(cwd, {
      chrome: options.chrome,
      refs: options.refs,
      append: options.append,
      replace: options.replace,
    });
  });

program
  .command("status")
  .description("Show matrix completion table")
  .action(() => {
    statusCommand(cwd);
  });

program
  .command("list-chrome")
  .description("Query available Chrome versions")
  .option("--latest <n>", "Show only the latest N versions", parseInt)
  .option("--since <date>", "Show versions since a date")
  .action(async (options) => {
    await listChromeCommand({
      latest: options.latest,
      since: options.since,
    });
  });

const cache = program.command("cache").description("Manage Chrome binary cache");

cache
  .command("clean")
  .description("Remove all cached Chrome binaries")
  .action(async () => {
    await cacheCleanCommand(cwd);
  });

program
  .command("clean")
  .description("Remove worktrees")
  .action(() => {
    cleanCommand(cwd);
  });

program.parse();
