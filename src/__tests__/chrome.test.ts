import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveCacheDir, cleanCache } from "../chrome.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-chrome-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("resolveCacheDir", () => {
  it("uses config value when provided", () => {
    const result = resolveCacheDir("/custom/cache");
    expect(result).toBe("/custom/cache");
  });

  it("uses XDG_CACHE_HOME when set and no config value", () => {
    const origXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";
    try {
      const result = resolveCacheDir();
      expect(result).toBe("/tmp/xdg-cache/chrome-ranger");
    } finally {
      if (origXdg !== undefined) {
        process.env.XDG_CACHE_HOME = origXdg;
      } else {
        delete process.env.XDG_CACHE_HOME;
      }
    }
  });

  it("falls back to ~/.cache/chrome-ranger", () => {
    const origXdg = process.env.XDG_CACHE_HOME;
    delete process.env.XDG_CACHE_HOME;
    try {
      const result = resolveCacheDir();
      expect(result).toBe(path.join(os.homedir(), ".cache", "chrome-ranger"));
    } finally {
      if (origXdg !== undefined) {
        process.env.XDG_CACHE_HOME = origXdg;
      }
    }
  });
});

describe("cleanCache", () => {
  it("removes the cache directory", async () => {
    const cacheDir = path.join(tmpDir, "cache");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, "test"), "data");

    await cleanCache(cacheDir);

    await expect(fs.access(cacheDir)).rejects.toThrow();
  });

  it("is idempotent (no error if directory doesn't exist)", async () => {
    const cacheDir = path.join(tmpDir, "nonexistent");
    await expect(cleanCache(cacheDir)).resolves.toBeUndefined();
  });
});
