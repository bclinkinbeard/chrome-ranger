import {
  openSync,
  closeSync,
  writeSync,
  readFileSync,
  unlinkSync,
  constants,
} from "node:fs";
import { resolve } from "node:path";
import { ensureParentDir } from "./storage.js";

export class Lockfile {
  private lockPath: string;
  private acquired = false;

  constructor(baseDir: string) {
    this.lockPath = resolve(baseDir, "lock");
  }

  acquire(): void {
    ensureParentDir(this.lockPath);

    // Check for stale lock
    try {
      const content = readFileSync(this.lockPath, "utf-8").trim();
      const pid = parseInt(content, 10);
      if (!isNaN(pid)) {
        if (isProcessAlive(pid)) {
          throw new Error(
            `Another chrome-ranger process is running (PID ${pid}). If this is wrong, remove ${this.lockPath}`,
          );
        }
        // Stale lock from dead process — reclaim it
        unlinkSync(this.lockPath);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        if (err instanceof Error && err.message.includes("Another chrome-ranger")) {
          throw err;
        }
      }
    }

    // Atomic creation with O_EXCL
    try {
      const fd = openSync(
        this.lockPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      );
      writeSync(fd, String(process.pid) + "\n");
      closeSync(fd);
      this.acquired = true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(
          `Another chrome-ranger process is running. If this is wrong, remove ${this.lockPath}`,
        );
      }
      throw err;
    }
  }

  release(): void {
    if (this.acquired) {
      try {
        unlinkSync(this.lockPath);
      } catch {
        // Ignore errors during cleanup
      }
      this.acquired = false;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
