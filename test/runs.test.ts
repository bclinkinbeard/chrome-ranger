import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadRuns, appendRun, writeRuns } from "../src/runs.js";
import type { RunMeta } from "../src/matrix.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function makeRun(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    chrome: "120.0.6099.109",
    ref: "main",
    sha: "e7f8a9b",
    iteration: 0,
    timestamp: "2026-02-18T10:30:00.000Z",
    durationMs: 4523,
    exitCode: 0,
    ...overrides,
  };
}

describe("runs.jsonl", () => {
  let tmpDir: string;
  let jsonlPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-runs-"));
    jsonlPath = path.join(tmpDir, "runs.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadRuns", () => {
    it("returns empty array when file does not exist", () => {
      const runs = loadRuns(jsonlPath);
      expect(runs).toEqual([]);
    });

    it("returns empty array for empty file", () => {
      fs.writeFileSync(jsonlPath, "");
      const runs = loadRuns(jsonlPath);
      expect(runs).toEqual([]);
    });

    it("parses single JSON line", () => {
      const run = makeRun();
      fs.writeFileSync(jsonlPath, JSON.stringify(run) + "\n");
      const runs = loadRuns(jsonlPath);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(run);
    });

    it("parses multiple JSON lines", () => {
      const r1 = makeRun({ id: "id1", iteration: 0 });
      const r2 = makeRun({ id: "id2", iteration: 1 });
      fs.writeFileSync(
        jsonlPath,
        JSON.stringify(r1) + "\n" + JSON.stringify(r2) + "\n"
      );
      const runs = loadRuns(jsonlPath);
      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe("id1");
      expect(runs[1].id).toBe("id2");
    });

    it("each line has all required RunMeta fields", () => {
      const run = makeRun();
      fs.writeFileSync(jsonlPath, JSON.stringify(run) + "\n");
      const [loaded] = loadRuns(jsonlPath);
      expect(loaded).toHaveProperty("id");
      expect(loaded).toHaveProperty("chrome");
      expect(loaded).toHaveProperty("ref");
      expect(loaded).toHaveProperty("sha");
      expect(loaded).toHaveProperty("iteration");
      expect(loaded).toHaveProperty("timestamp");
      expect(loaded).toHaveProperty("durationMs");
      expect(loaded).toHaveProperty("exitCode");
    });
  });

  describe("appendRun", () => {
    it("appends to end of file", () => {
      const r1 = makeRun({ id: "id1" });
      const r2 = makeRun({ id: "id2" });
      appendRun(jsonlPath, r1);
      appendRun(jsonlPath, r2);
      const runs = loadRuns(jsonlPath);
      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe("id1");
      expect(runs[1].id).toBe("id2");
    });

    it("creates file if it does not exist", () => {
      const run = makeRun();
      appendRun(jsonlPath, run);
      expect(fs.existsSync(jsonlPath)).toBe(true);
    });

    it("creates parent directories if needed", () => {
      const deepPath = path.join(tmpDir, "a", "b", "runs.jsonl");
      const run = makeRun();
      appendRun(deepPath, run);
      expect(fs.existsSync(deepPath)).toBe(true);
    });

    it("existing lines are not modified", () => {
      const r1 = makeRun({ id: "id1" });
      appendRun(jsonlPath, r1);
      const before = fs.readFileSync(jsonlPath, "utf-8");
      const r2 = makeRun({ id: "id2" });
      appendRun(jsonlPath, r2);
      const after = fs.readFileSync(jsonlPath, "utf-8");
      expect(after.startsWith(before)).toBe(true);
    });
  });

  describe("writeRuns", () => {
    it("overwrites file with filtered runs", () => {
      const r1 = makeRun({ id: "id1" });
      const r2 = makeRun({ id: "id2" });
      const r3 = makeRun({ id: "id3" });
      appendRun(jsonlPath, r1);
      appendRun(jsonlPath, r2);
      appendRun(jsonlPath, r3);

      // Write back only r1 and r3
      writeRuns(jsonlPath, [r1, r3]);
      const runs = loadRuns(jsonlPath);
      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe("id1");
      expect(runs[1].id).toBe("id3");
    });

    it("creates empty file when given empty array", () => {
      writeRuns(jsonlPath, []);
      expect(fs.existsSync(jsonlPath)).toBe(true);
      expect(fs.readFileSync(jsonlPath, "utf-8")).toBe("");
    });
  });
});
