import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { acquireLock } from "../src/lockfile.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Lockfile", () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-lock-"));
    lockPath = path.join(tmpDir, "lock");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates lock file on acquire", async () => {
    const release = await acquireLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    release();
  });

  it("lock file contains current PID", async () => {
    const release = await acquireLock(lockPath);
    const content = fs.readFileSync(lockPath, "utf-8");
    expect(content.trim()).toBe(String(process.pid));
    release();
  });

  it("second acquire fails when lock is held", async () => {
    const release = await acquireLock(lockPath);
    await expect(acquireLock(lockPath)).rejects.toThrow(/another.*running|lock/i);
    release();
  });

  it("releases lock after calling release function", async () => {
    const release = await acquireLock(lockPath);
    release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("can re-acquire after release", async () => {
    const release1 = await acquireLock(lockPath);
    release1();
    const release2 = await acquireLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    release2();
  });

  it("reclaims lock from dead process", async () => {
    // Write a lockfile with a PID that doesn't exist
    fs.writeFileSync(lockPath, "999999999");
    const release = await acquireLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    const content = fs.readFileSync(lockPath, "utf-8");
    expect(content.trim()).toBe(String(process.pid));
    release();
  });

  it("creates parent directories if needed", async () => {
    const deepLockPath = path.join(tmpDir, "a", "b", "lock");
    const release = await acquireLock(deepLockPath);
    expect(fs.existsSync(deepLockPath)).toBe(true);
    release();
  });
});
