import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Lockfile } from "../src/lock.js";

const TMP = resolve(import.meta.dirname, ".tmp-lock-test");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("Lockfile", () => {
  it("acquires and releases lock", () => {
    const lock = new Lockfile(TMP);
    lock.acquire();

    const content = readFileSync(resolve(TMP, "lock"), "utf-8").trim();
    expect(parseInt(content, 10)).toBe(process.pid);

    lock.release();
    expect(() => readFileSync(resolve(TMP, "lock"))).toThrow();
  });

  it("fails when lock is held by current process", () => {
    const lock1 = new Lockfile(TMP);
    lock1.acquire();

    const lock2 = new Lockfile(TMP);
    expect(() => lock2.acquire()).toThrow("Another chrome-ranger");

    lock1.release();
  });

  it("reclaims stale lock from dead process", () => {
    // Write a lock with a PID that doesn't exist
    writeFileSync(resolve(TMP, "lock"), "999999\n");

    const lock = new Lockfile(TMP);
    // Should not throw — stale lock from dead process
    lock.acquire();
    lock.release();
  });

  it("release is idempotent", () => {
    const lock = new Lockfile(TMP);
    lock.acquire();
    lock.release();
    lock.release(); // Should not throw
  });
});
