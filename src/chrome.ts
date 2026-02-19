import {
  install,
  Browser,
  detectBrowserPlatform,
  computeExecutablePath,
  getInstalledBrowsers,
} from "@puppeteer/browsers";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { chromeCacheDir } from "./storage.js";
import { log, logError } from "./log.js";

export async function ensureChrome(
  version: string,
  configCacheDir?: string,
): Promise<string> {
  const cacheDir = chromeCacheDir(configCacheDir);
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Could not detect browser platform");
  }

  // Check if already installed
  const execPath = computeExecutablePath({
    browser: Browser.CHROME,
    buildId: version,
    cacheDir,
  });

  const installed = await getInstalledBrowsers({ cacheDir });
  const alreadyInstalled = installed.some(
    (b) => b.browser === Browser.CHROME && b.buildId === version,
  );

  if (alreadyInstalled) {
    log(`  chrome@${version}       \u2713  cached`);
    return execPath;
  }

  log(`  chrome@${version}       downloading...`);
  await install({
    browser: Browser.CHROME,
    buildId: version,
    cacheDir,
  });
  log(`  chrome@${version}       \u2713  downloaded`);

  return execPath;
}

export async function listChromeVersions(): Promise<
  Array<{ version: string; revision: string }>
> {
  const resp = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json",
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch Chrome versions: ${resp.status}`);
  }
  const data = (await resp.json()) as {
    versions: Array<{ version: string; revision: string }>;
  };
  return data.versions;
}

export async function cleanChromeCache(configCacheDir?: string): Promise<void> {
  const cacheDir = chromeCacheDir(configCacheDir);
  try {
    rmSync(cacheDir, { recursive: true, force: true });
    log(`Removed Chrome cache at ${cacheDir}`);
  } catch {
    log(`No Chrome cache found at ${cacheDir}`);
  }
}
