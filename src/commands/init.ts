import { existsSync, writeFileSync } from "node:fs";
import { findConfigPath, DEFAULT_CONFIG } from "../config.js";
import { log, logError } from "../log.js";

export function initCommand(cwd: string, force: boolean): void {
  const configPath = findConfigPath(cwd);

  if (existsSync(configPath) && !force) {
    logError(
      `${configPath} already exists. Use --force to overwrite.`,
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(configPath, DEFAULT_CONFIG);
  log(`Created ${configPath}`);
}
