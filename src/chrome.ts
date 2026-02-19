import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  install,
  computeExecutablePath,
  Browser,
  canDownload,
} from "@puppeteer/browsers";
import type { ChromeInstallation, ChromeVersionInfo } from "./types.js";

export async function ensureChrome(
  version: string,
  cacheDir: string,
): Promise<ChromeInstallation> {
  // Check if already installed by trying to resolve the executable path
  try {
    const executablePath = computeExecutablePath({
      browser: Browser.CHROME,
      buildId: version,
      cacheDir,
    });
    // Verify the executable exists
    await fs.access(executablePath);
    return { version, executablePath };
  } catch {
    // Not cached, need to download
  }

  try {
    const result = await install({
      browser: Browser.CHROME,
      buildId: version,
      cacheDir,
    });
    return { version, executablePath: result.executablePath };
  } catch (err: unknown) {
    throw new Error(
      `Failed to download Chrome ${version}: ${(err as Error).message}`,
    );
  }
}

export function resolveCacheDir(configCacheDir?: string): string {
  if (configCacheDir) {
    return path.resolve(configCacheDir);
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  if (xdgCacheHome) {
    return path.resolve(xdgCacheHome, "chrome-ranger");
  }

  return path.join(os.homedir(), ".cache", "chrome-ranger");
}

export async function listChromeVersions(): Promise<ChromeVersionInfo[]> {
  const res = await fetch(
    "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json",
  );
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Chrome versions: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as {
    versions: Array<{ version: string; revision: string }>;
  };

  // Return all versions sorted newest first
  return data.versions
    .map((v) => ({
      version: v.version,
      revision: v.revision,
      channel: "stable",
    }))
    .reverse();
}

export async function cleanCache(cacheDir: string): Promise<void> {
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}
