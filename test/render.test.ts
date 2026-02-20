import { describe, it, expect } from "vitest";
import {
  renderBar,
  renderCellSuffix,
  renderCell,
  formatLogLine,
  renderProgressLine,
  renderWorkerLine,
  heatmapGlyph,
} from "../src/render.js";

describe("Render primitives", () => {
  describe("renderBar", () => {
    it("renders all empty for 0 passed, 0 failed", () => {
      expect(renderBar(0, 0, 5)).toBe("░░░░░");
    });

    it("renders all filled for all passed", () => {
      expect(renderBar(5, 0, 5)).toBe("█████");
    });

    it("renders partial progress", () => {
      expect(renderBar(3, 0, 5)).toBe("███░░");
    });

    it("renders failures at correct positions", () => {
      // 3 passed, then 1 failure, then 1 remaining
      const result = renderBar(3, 1, 5);
      expect(result).toBe("███✗░");
    });

    it("renders multiple failures", () => {
      const result = renderBar(2, 2, 5);
      expect(result).toBe("██✗✗░");
    });

    it("renders bar of width 10", () => {
      expect(renderBar(10, 0, 10)).toBe("██████████");
    });

    it("renders all failures", () => {
      expect(renderBar(0, 3, 3)).toBe("✗✗✗");
    });
  });

  describe("renderCellSuffix", () => {
    it("returns check mark for complete cells with no failures", () => {
      expect(renderCellSuffix(5, 0, 5)).toBe("✓");
    });

    it("returns cross + count for cells with failures", () => {
      expect(renderCellSuffix(4, 1, 5)).toBe("✗1");
    });

    it("returns cross + count for multiple failures", () => {
      expect(renderCellSuffix(3, 2, 5)).toBe("✗2");
    });

    it("returns empty string for in-progress cells with no failures", () => {
      expect(renderCellSuffix(3, 0, 5)).toBe("");
    });

    it("returns empty string for not-started cells", () => {
      expect(renderCellSuffix(0, 0, 5)).toBe("");
    });
  });

  describe("renderCell", () => {
    it("renders complete cell with checkmark", () => {
      const result = renderCell(5, 0, 5);
      expect(result).toContain("█████");
      expect(result).toContain("5/5");
      expect(result).toContain("✓");
    });

    it("renders in-progress cell with fraction only", () => {
      const result = renderCell(3, 0, 5);
      expect(result).toContain("███░░");
      expect(result).toContain("3/5");
      expect(result).not.toContain("✓");
      expect(result).not.toContain("✗");
    });

    it("renders not-started cell", () => {
      const result = renderCell(0, 0, 5);
      expect(result).toContain("░░░░░");
      expect(result).toContain("0/5");
    });

    it("renders cell with failures", () => {
      const result = renderCell(4, 1, 5);
      expect(result).toContain("████✗");
      expect(result).toContain("4/5");
      expect(result).toContain("✗1");
    });

    it("drops denominator for complete cells at scale", () => {
      const result = renderCell(10, 0, 10);
      expect(result).toContain("10 ✓");
      expect(result).not.toContain("10/10");
    });

    it("keeps fraction for in-progress cells at scale", () => {
      const result = renderCell(7, 0, 10);
      expect(result).toContain("7/10");
    });
  });

  describe("formatLogLine", () => {
    it("formats successful iteration without exit code", () => {
      const line = formatLogLine(3, 45, "chrome@120 x main (e7f8a9b)", 1, 4210, 0);
      expect(line).toContain("[ 3/45]");
      expect(line).toContain("chrome@120 x main (e7f8a9b)");
      expect(line).toContain("#1");
      expect(line).toContain("4210ms");
      expect(line).not.toContain("exit:");
      expect(line).not.toContain("FAIL");
    });

    it("formats failed iteration with FAIL and no inline stderr", () => {
      const line = formatLogLine(21, 45, "chrome@120 x v5.0.0-beta.1 (f9a0b1c)", 2, 2455, 1);
      expect(line).toContain("[21/45]");
      expect(line).toContain("2455ms");
      expect(line).toContain("FAIL");
      expect(line).not.toContain("exit:");
    });

    it("includes inline stderr when provided for failures", () => {
      const stderr = "Error: Timed out waiting for selector\n    at bench.spec.ts:5:15";
      const line = formatLogLine(21, 45, "chrome@120 x main (e7f8a9b)", 2, 2455, 1, stderr);
      expect(line).toContain("FAIL");
      expect(line).toContain("Error: Timed out waiting for selector");
      expect(line).toContain("at bench.spec.ts:5:15");
    });

    it("does not include stderr for successful iterations", () => {
      const stderr = "some warning text";
      const line = formatLogLine(3, 45, "chrome@120 x main (e7f8a9b)", 1, 4210, 0, stderr);
      expect(line).not.toContain("some warning text");
    });

    it("truncates stderr to last 2 lines", () => {
      const stderr = "line1\nline2\nline3\nError: boom\n    at file.ts:1:1";
      const line = formatLogLine(1, 10, "chrome@120 x main (abc1234)", 0, 100, 1, stderr);
      expect(line).toContain("Error: boom");
      expect(line).toContain("at file.ts:1:1");
      expect(line).not.toContain("line1");
      expect(line).not.toContain("line2");
      expect(line).not.toContain("line3");
    });

    it("pads sequence number to match total width", () => {
      const line = formatLogLine(1, 240, "chrome@120 x main (abc1234)", 0, 100, 0);
      expect(line).toContain("[  1/240]");
    });
  });

  describe("renderProgressLine", () => {
    it("renders basic progress", () => {
      const line = renderProgressLine(6, 45, "0:41", 0);
      expect(line).toContain("chrome-ranger run");
      expect(line).toContain("6/45");
      expect(line).toContain("13%");
      expect(line).toContain("0:41");
      expect(line).not.toContain("failed");
    });

    it("includes failure count when > 0", () => {
      const line = renderProgressLine(28, 45, "2:14", 1);
      expect(line).toContain("28/45");
      expect(line).toContain("62%");
      expect(line).toContain("1 failed");
    });

    it("renders warmup progress", () => {
      const line = renderProgressLine(5, 9, "0:18", 0, true);
      expect(line).toContain("warmup");
      expect(line).toContain("5/9");
    });

    it("renders 100% completion", () => {
      const line = renderProgressLine(45, 45, "3m 22s", 2);
      expect(line).toContain("100%");
      expect(line).toContain("2 failed");
    });
  });

  describe("renderWorkerLine", () => {
    it("renders two workers on one line", () => {
      const workers = [
        { id: 1, label: "chrome@120 x v4.5.0 #2", elapsed: "3.1s" },
        { id: 3, label: "chrome@122 x main #4", elapsed: "0.6s" },
      ];
      const line = renderWorkerLine(workers);
      expect(line).toContain("w1");
      expect(line).toContain("chrome@120 x v4.5.0 #2");
      expect(line).toContain("3.1s");
      expect(line).toContain("w3");
      expect(line).toContain("chrome@122 x main #4");
      expect(line).toContain("0.6s");
    });

    it("renders single worker", () => {
      const workers = [
        { id: 1, label: "chrome@120 x main #2", elapsed: "1.8s" },
      ];
      const line = renderWorkerLine(workers);
      expect(line).toContain("w1");
      expect(line).toContain("1.8s");
    });

    it("returns empty string for no workers", () => {
      expect(renderWorkerLine([])).toBe("");
    });
  });

  describe("heatmapGlyph", () => {
    it("returns █ for complete cells", () => {
      expect(heatmapGlyph(5, 0, 5)).toBe("█");
    });

    it("returns ✗ for cells with any failure (overrides completion)", () => {
      expect(heatmapGlyph(4, 1, 5)).toBe("✗");
    });

    it("returns ✗ for cells with failures even when complete", () => {
      expect(heatmapGlyph(5, 1, 5)).toBe("✗");
    });

    it("returns ▓ for >50% complete", () => {
      expect(heatmapGlyph(6, 0, 10)).toBe("▓");
    });

    it("returns ▒ for started (>0% but <=50%)", () => {
      expect(heatmapGlyph(1, 0, 10)).toBe("▒");
    });

    it("returns ░ for not started", () => {
      expect(heatmapGlyph(0, 0, 10)).toBe("░");
    });

    it("returns ▓ for exactly 50%", () => {
      // 50% is <=50%, but the proposal says >50% for ▓
      // so 5/10 is exactly 50% → ▒
      expect(heatmapGlyph(5, 0, 10)).toBe("▒");
    });

    it("returns ▓ for 51%+", () => {
      expect(heatmapGlyph(6, 0, 10)).toBe("▓");
    });
  });
});
