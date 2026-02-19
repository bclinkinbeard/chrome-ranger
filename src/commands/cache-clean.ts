import { findConfigPath, parseConfig } from "../config.js";
import { cleanChromeCache } from "../chrome.js";
import { logError } from "../log.js";

export async function cacheCleanCommand(cwd: string): Promise<void> {
  let cacheDir: string | undefined;
  try {
    const config = parseConfig(findConfigPath(cwd));
    cacheDir = config.chrome.cache_dir;
  } catch {
    // No config or invalid config — use default cache dir
  }

  try {
    await cleanChromeCache(cacheDir);
  } catch (err: unknown) {
    logError((err as Error).message);
    process.exitCode = 1;
  }
}
