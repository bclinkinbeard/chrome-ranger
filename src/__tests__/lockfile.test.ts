import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { acquireLock, releaseLock, LockError } from "../lockfile.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-lock-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("acquireLock", () => {
  it("creates lock file with current PID", async () => {
    await acquireLock(tmpDir);
    const content = await fs.readFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "utf-8",
    );
    expect(content.trim()).toBe(String(process.pid));
  });

  it("succeeds when no lock exists", async () => {
    await expect(acquireLock(tmpDir)).resolves.toBeUndefined();
  });

  it("throws LockError when another live process holds the lock", async () => {
    // PID 1 (init) is always alive
    await fs.mkdir(path.join(tmpDir, ".chrome-ranger"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "1\n",
      "utf-8",
    );

    await expect(acquireLock(tmpDir)).rejects.toThrow(LockError);
    await expect(acquireLock(tmpDir)).rejects.toThrow("PID 1");
  });

  it("reclaims lock when PID is dead", async () => {
    await fs.mkdir(path.join(tmpDir, ".chrome-ranger"), { recursive: true });
    // Use a very high PID that's almost certainly not running
    await fs.writeFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "9999999\n",
      "utf-8",
    );

    await expect(acquireLock(tmpDir)).resolves.toBeUndefined();
    const content = await fs.readFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "utf-8",
    );
    expect(content.trim()).toBe(String(process.pid));
  });

  it("reclaims lock when content is non-numeric", async () => {
    await fs.mkdir(path.join(tmpDir, ".chrome-ranger"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "garbage\n",
      "utf-8",
    );

    await expect(acquireLock(tmpDir)).resolves.toBeUndefined();
  });

  it("reclaims lock when file is empty", async () => {
    await fs.mkdir(path.join(tmpDir, ".chrome-ranger"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".chrome-ranger", "lock"),
      "",
      "utf-8",
    );

    await expect(acquireLock(tmpDir)).resolves.toBeUndefined();
  });

  it("creates .chrome-ranger/ if missing", async () => {
    await acquireLock(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, ".chrome-ranger"));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("releaseLock", () => {
  it("removes the lock file", async () => {
    await acquireLock(tmpDir);
    await releaseLock(tmpDir);

    await expect(
      fs.access(path.join(tmpDir, ".chrome-ranger", "lock")),
    ).rejects.toThrow();
  });

  it("is idempotent (no error if lock doesn't exist)", async () => {
    await expect(releaseLock(tmpDir)).resolves.toBeUndefined();
  });
});
