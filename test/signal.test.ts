import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installSignalHandlers, type SignalCleanup } from "../src/signal.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Signal Handling", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-signal-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers cleanup functions", () => {
    const cleanup = installSignalHandlers();
    expect(cleanup).toBeDefined();
    expect(typeof cleanup.uninstall).toBe("function");
    cleanup.uninstall();
  });

  it("cleanup calls registered handlers on uninstall", () => {
    const cleanup = installSignalHandlers();
    let called = false;
    cleanup.addCleanup(() => {
      called = true;
    });
    cleanup.runCleanup();
    expect(called).toBe(true);
    cleanup.uninstall();
  });

  it("cleanup releases lockfile", () => {
    const lockPath = path.join(tmpDir, "lock");
    fs.writeFileSync(lockPath, String(process.pid));

    const cleanup = installSignalHandlers();
    cleanup.addCleanup(() => {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ok
      }
    });

    expect(fs.existsSync(lockPath)).toBe(true);
    cleanup.runCleanup();
    expect(fs.existsSync(lockPath)).toBe(false);
    cleanup.uninstall();
  });

  it("cleanup handles multiple cleanups", () => {
    const results: string[] = [];
    const cleanup = installSignalHandlers();
    cleanup.addCleanup(() => results.push("first"));
    cleanup.addCleanup(() => results.push("second"));
    cleanup.runCleanup();
    expect(results).toEqual(["first", "second"]);
    cleanup.uninstall();
  });
});
