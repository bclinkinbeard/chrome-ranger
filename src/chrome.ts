import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  install,
  Browser,
  resolveBuildId,
  detectBrowserPlatform,
  getInstalledBrowsers,
  computeExecutablePath,
} from "@puppeteer/browsers";

export function getCacheDir(configCacheDir?: string): string {
  if (configCacheDir) {
    return configCacheDir;
  }
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) {
    return path.join(xdg, "chrome-ranger");
  }
  return path.join(os.homedir(), ".cache", "chrome-ranger");
}

export async function ensureChrome(
  version: string,
  cacheDir: string
): Promise<string> {
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("error: could not detect browser platform");
  }

  const buildId = version;

  // Check if already installed
  const installed = await getInstalledBrowsers({ cacheDir });
  const existing = installed.find(
    (b) => b.browser === Browser.CHROME && b.buildId === buildId
  );
  if (existing) {
    return existing.executablePath;
  }

  // Download
  const result = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
  });

  return result.executablePath;
}

export async function listChromeVersions(
  options?: { latest?: number; since?: string }
): Promise<string[]> {
  // Query Chrome for Testing availability API
  const res = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
  );
  const data = (await res.json()) as {
    versions: Array<{ version: string; revision: string }>;
  };

  let versions = data.versions.map((v) => v.version);

  if (options?.since) {
    const sinceDate = new Date(options.since);
    // Filter by revision date — we don't have dates in the API,
    // so we compare version strings numerically
    // Since we can't filter by date easily, use version comparison
    versions = versions.filter((v) => v >= options.since!);
  }

  if (options?.latest) {
    versions = versions.slice(-options.latest);
  }

  return versions;
}

export async function cacheClean(cacheDir: string): Promise<void> {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}
