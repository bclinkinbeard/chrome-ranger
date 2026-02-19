import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initConfig } from "../src/init.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("chrome-ranger init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-init-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates chrome-ranger.yaml with scaffold content", async () => {
    await initConfig(tmpDir, false);
    const configPath = path.join(tmpDir, "chrome-ranger.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("command:");
    expect(content).toContain("iterations:");
    expect(content).toContain("chrome:");
    expect(content).toContain("versions:");
    expect(content).toContain("code:");
    expect(content).toContain("refs:");
  });

  it("refuses to overwrite existing config", async () => {
    const configPath = path.join(tmpDir, "chrome-ranger.yaml");
    fs.writeFileSync(configPath, "existing content");
    await expect(initConfig(tmpDir, false)).rejects.toThrow(
      /already exists/i
    );
    // Original content unchanged
    expect(fs.readFileSync(configPath, "utf-8")).toBe("existing content");
  });

  it("overwrites with --force", async () => {
    const configPath = path.join(tmpDir, "chrome-ranger.yaml");
    fs.writeFileSync(configPath, "old content");
    await initConfig(tmpDir, true);
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).not.toBe("old content");
    expect(content).toContain("command:");
  });
});
