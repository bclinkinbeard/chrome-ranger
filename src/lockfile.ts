import * as fs from "node:fs/promises";
import * as path from "node:path";
import { constants } from "node:fs";

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockError";
  }
}

function lockPath(projectDir: string): string {
  return path.join(projectDir, ".chrome-ranger", "lock");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(projectDir: string): Promise<void> {
  const dir = path.join(projectDir, ".chrome-ranger");
  await fs.mkdir(dir, { recursive: true });

  const lockFile = lockPath(projectDir);
  const myPid = String(process.pid) + "\n";

  // Try exclusive create first
  try {
    const fd = await fs.open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    await fd.writeFile(myPid, "utf-8");
    await fd.close();
    return;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }

  // File exists — check if stale
  let content: string;
  try {
    content = await fs.readFile(lockFile, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Race: someone removed it between our attempts
      return acquireLock(projectDir);
    }
    throw err;
  }

  const pid = parseInt(content.trim(), 10);

  if (Number.isNaN(pid)) {
    // Corrupted lock — reclaim
    await fs.unlink(lockFile);
    return acquireLock(projectDir);
  }

  if (isPidAlive(pid)) {
    throw new LockError(
      `Another chrome-ranger process (PID ${pid}) is running against this project`,
    );
  }

  // Stale lock — reclaim
  await fs.unlink(lockFile);
  return acquireLock(projectDir);
}

export async function releaseLock(projectDir: string): Promise<void> {
  try {
    await fs.unlink(lockPath(projectDir));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}
