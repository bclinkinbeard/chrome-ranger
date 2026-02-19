import type { ChildProcess } from "node:child_process";

export interface SignalCleanup {
  addCleanup: (fn: () => void) => void;
  runCleanup: () => void;
  uninstall: () => void;
  trackProcess: (child: ChildProcess) => void;
}

export function installSignalHandlers(): SignalCleanup {
  const cleanups: Array<() => void> = [];
  const trackedProcesses = new Set<ChildProcess>();
  let cleaned = false;

  const runCleanup = () => {
    if (cleaned) return;
    cleaned = true;

    // Kill all tracked child processes
    for (const child of trackedProcesses) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Process may have already exited
      }
    }

    // Run registered cleanups
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // Best-effort cleanup
      }
    }
  };

  const onSignal = () => {
    runCleanup();
    process.exit(1);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  return {
    addCleanup: (fn: () => void) => {
      cleanups.push(fn);
    },
    runCleanup,
    uninstall: () => {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    },
    trackProcess: (child: ChildProcess) => {
      trackedProcesses.add(child);
      child.on("exit", () => trackedProcesses.delete(child));
    },
  };
}
