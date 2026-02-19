import fs from "node:fs";
import path from "node:path";
import type { RunMeta } from "./matrix.js";

export function loadRuns(jsonlPath: string): RunMeta[] {
  if (!fs.existsSync(jsonlPath)) {
    return [];
  }
  const content = fs.readFileSync(jsonlPath, "utf-8").trim();
  if (!content) {
    return [];
  }
  return content.split("\n").map((line) => JSON.parse(line) as RunMeta);
}

export function appendRun(jsonlPath: string, run: RunMeta): void {
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
  fs.appendFileSync(jsonlPath, JSON.stringify(run) + "\n");
}

export function writeRuns(jsonlPath: string, runs: RunMeta[]): void {
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
  const content = runs.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(jsonlPath, content ? content + "\n" : "");
}
