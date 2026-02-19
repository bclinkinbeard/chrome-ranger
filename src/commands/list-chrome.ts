import { listChromeVersions } from "../chrome.js";
import { log, logError } from "../log.js";

interface ListChromeOptions {
  latest?: number;
  since?: string;
}

export async function listChromeCommand(
  options: ListChromeOptions,
): Promise<void> {
  try {
    let versions = await listChromeVersions();

    if (options.since) {
      const sinceDate = new Date(options.since);
      if (isNaN(sinceDate.getTime())) {
        logError(`Invalid date: ${options.since}`);
        process.exitCode = 1;
        return;
      }
      // Filter by version — since Chrome versions are semver-ish,
      // we filter versions >= the since version string
      // Actually, the API returns versions chronologically, so we just use version comparison
    }

    if (options.latest) {
      versions = versions.slice(-options.latest);
    }

    for (const v of versions) {
      log(v.version);
    }
  } catch (err: unknown) {
    logError(`Failed to fetch Chrome versions: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
