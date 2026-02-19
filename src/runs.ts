import { readFileSync, appendFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RunMeta } from "./types.js";
import { ensureParentDir, outputDir } from "./storage.js";

export function loadRuns(runsPath: string): RunMeta[] {
  try {
    const content = readFileSync(runsPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines.map((line) => JSON.parse(line) as RunMeta);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export function appendRun(runsPath: string, run: RunMeta): void {
  ensureParentDir(runsPath);
  appendFileSync(runsPath, JSON.stringify(run) + "\n");
}

export function writeRuns(runsPath: string, runs: RunMeta[]): void {
  ensureParentDir(runsPath);
  const content = runs.map((r) => JSON.stringify(r)).join("\n") + (runs.length > 0 ? "\n" : "");
  writeFileSync(runsPath, content);
}

export function deleteRunOutputs(cwd: string, ids: string[]): void {
  const outDir = outputDir(cwd);
  for (const id of ids) {
    for (const ext of [".stdout", ".stderr"]) {
      const filePath = resolve(outDir, id + ext);
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore missing files
      }
    }
  }
}

export function removeRuns(
  runsPath: string,
  cwd: string,
  predicate: (run: RunMeta) => boolean,
): RunMeta[] {
  const allRuns = loadRuns(runsPath);
  const toRemove = allRuns.filter(predicate);
  const toKeep = allRuns.filter((r) => !predicate(r));

  writeRuns(runsPath, toKeep);
  deleteRunOutputs(cwd, toRemove.map((r) => r.id));

  return toRemove;
}
