import { describe, it, expect, afterEach, vi } from "vitest";
import { chromeCacheDir, projectDir, outputDir, runsJsonlPath, worktreesDir } from "../src/storage.js";
import { homedir } from "node:os";
import { resolve } from "node:path";

describe("storage paths", () => {
  it("projectDir returns .chrome-ranger under cwd", () => {
    expect(projectDir("/foo/bar")).toBe(resolve("/foo/bar", ".chrome-ranger"));
  });

  it("outputDir returns .chrome-ranger/output under cwd", () => {
    expect(outputDir("/foo/bar")).toBe(
      resolve("/foo/bar", ".chrome-ranger", "output"),
    );
  });

  it("runsJsonlPath returns .chrome-ranger/runs.jsonl under cwd", () => {
    expect(runsJsonlPath("/foo/bar")).toBe(
      resolve("/foo/bar", ".chrome-ranger", "runs.jsonl"),
    );
  });

  it("worktreesDir returns .chrome-ranger/worktrees under cwd", () => {
    expect(worktreesDir("/foo/bar")).toBe(
      resolve("/foo/bar", ".chrome-ranger", "worktrees"),
    );
  });
});

describe("chromeCacheDir", () => {
  const originalXdg = process.env.XDG_CACHE_HOME;

  afterEach(() => {
    if (originalXdg !== undefined) {
      process.env.XDG_CACHE_HOME = originalXdg;
    } else {
      delete process.env.XDG_CACHE_HOME;
    }
  });

  it("uses config cache_dir when provided", () => {
    expect(chromeCacheDir("/custom/cache")).toBe(resolve("/custom/cache"));
  });

  it("uses XDG_CACHE_HOME when set", () => {
    process.env.XDG_CACHE_HOME = "/xdg/cache";
    expect(chromeCacheDir()).toBe(resolve("/xdg/cache", "chrome-ranger"));
  });

  it("falls back to ~/.cache/chrome-ranger", () => {
    delete process.env.XDG_CACHE_HOME;
    expect(chromeCacheDir()).toBe(
      resolve(homedir(), ".cache", "chrome-ranger"),
    );
  });

  it("config cache_dir takes precedence over XDG_CACHE_HOME", () => {
    process.env.XDG_CACHE_HOME = "/xdg/cache";
    expect(chromeCacheDir("/custom/cache")).toBe(resolve("/custom/cache"));
  });
});
