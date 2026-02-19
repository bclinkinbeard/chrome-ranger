import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunMeta } from "./types.js";

const DATA_DIR = ".chrome-ranger";
const OUTPUT_DIR = "output";
const RUNS_FILE = "runs.jsonl";

export function runsJsonlPath(projectDir: string): string {
  return path.join(projectDir, DATA_DIR, RUNS_FILE);
}

export function stdoutPath(projectDir: string, id: string): string {
  return path.join(projectDir, DATA_DIR, OUTPUT_DIR, `${id}.stdout`);
}

export function stderrPath(projectDir: string, id: string): string {
  return path.join(projectDir, DATA_DIR, OUTPUT_DIR, `${id}.stderr`);
}

export async function ensureDataDir(projectDir: string): Promise<void> {
  await fs.mkdir(path.join(projectDir, DATA_DIR, OUTPUT_DIR), {
    recursive: true,
  });
}

export async function loadRuns(projectDir: string): Promise<RunMeta[]> {
  const filePath = runsJsonlPath(projectDir);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const runs: RunMeta[] = [];

  for (const line of lines) {
    try {
      runs.push(JSON.parse(line) as RunMeta);
    } catch {
      // skip corrupted lines
      if (process.env.DEBUG === "chrome-ranger") {
        process.stderr.write(`Warning: skipping corrupted line in runs.jsonl: ${line}\n`);
      }
    }
  }

  return runs;
}

export async function appendRun(
  projectDir: string,
  run: RunMeta,
): Promise<void> {
  await ensureDataDir(projectDir);
  const filePath = runsJsonlPath(projectDir);
  await fs.appendFile(filePath, JSON.stringify(run) + "\n", "utf-8");
}

export async function writeStdout(
  projectDir: string,
  id: string,
  content: string,
): Promise<void> {
  await ensureDataDir(projectDir);
  await fs.writeFile(stdoutPath(projectDir, id), content, "utf-8");
}

export async function writeStderr(
  projectDir: string,
  id: string,
  content: string,
): Promise<void> {
  await ensureDataDir(projectDir);
  await fs.writeFile(stderrPath(projectDir, id), content, "utf-8");
}

export async function deleteRuns(
  projectDir: string,
  predicate: (run: RunMeta) => boolean,
): Promise<RunMeta[]> {
  const allRuns = await loadRuns(projectDir);
  const keep: RunMeta[] = [];
  const remove: RunMeta[] = [];

  for (const run of allRuns) {
    if (predicate(run)) {
      remove.push(run);
    } else {
      keep.push(run);
    }
  }

  // Delete output files for removed runs
  for (const run of remove) {
    try {
      await fs.unlink(stdoutPath(projectDir, run.id));
    } catch {
      // ignore missing files
    }
    try {
      await fs.unlink(stderrPath(projectDir, run.id));
    } catch {
      // ignore missing files
    }
  }

  // Rewrite runs.jsonl
  const filePath = runsJsonlPath(projectDir);
  if (keep.length === 0) {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore if missing
    }
  } else {
    const content = keep.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.writeFile(filePath, content, "utf-8");
  }

  return keep;
}
