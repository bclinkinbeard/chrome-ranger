import fs from "node:fs";
import path from "node:path";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(lockPath: string): Promise<() => void> {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  if (fs.existsSync(lockPath)) {
    const existingPid = parseInt(fs.readFileSync(lockPath, "utf-8").trim(), 10);
    if (!isNaN(existingPid) && isProcessAlive(existingPid)) {
      throw new Error(
        `error: another chrome-ranger process is running (PID ${existingPid}). Lock file: ${lockPath}`
      );
    }
    // Dead process — reclaim
    fs.unlinkSync(lockPath);
  }

  // Write lock with O_EXCL for atomicity
  const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
  fs.writeSync(fd, String(process.pid));
  fs.closeSync(fd);

  const release = () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // already removed
    }
  };

  return release;
}
