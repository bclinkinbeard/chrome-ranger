import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initCommand } from "../src/commands/init.js";

const TMP = resolve(import.meta.dirname, ".tmp-init-test");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("init command", () => {
  it("creates chrome-ranger.yaml with scaffold content", () => {
    initCommand(TMP, false);
    const configPath = resolve(TMP, "chrome-ranger.yaml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("command:");
    expect(content).toContain("chrome:");
    expect(content).toContain("versions:");
    expect(content).toContain("code:");
    expect(content).toContain("refs:");
  });

  it("refuses to overwrite existing config without --force", () => {
    const configPath = resolve(TMP, "chrome-ranger.yaml");
    writeFileSync(configPath, "existing: config\n");

    initCommand(TMP, false);
    expect(process.exitCode).toBe(1);

    // File should be unchanged
    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe("existing: config\n");
  });

  it("overwrites existing config with --force", () => {
    const configPath = resolve(TMP, "chrome-ranger.yaml");
    writeFileSync(configPath, "existing: config\n");

    initCommand(TMP, true);
    expect(process.exitCode).toBeUndefined();

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("command:");
    expect(content).not.toBe("existing: config\n");
  });
});
