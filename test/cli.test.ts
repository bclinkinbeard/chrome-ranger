import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "cli.js");

describe("CLI Integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cli --help shows usage", () => {
    const result = execSync(`node ${cliPath} --help`, {
      cwd: projectRoot,
    }).toString();
    expect(result).toContain("chrome-ranger");
  });

  it("init creates chrome-ranger.yaml", () => {
    execSync(`node ${cliPath} init`, {
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, "chrome-ranger.yaml"))).toBe(true);
  });

  it("init refuses overwrite without --force", () => {
    fs.writeFileSync(path.join(tmpDir, "chrome-ranger.yaml"), "existing");
    expect(() =>
      execSync(`node ${cliPath} init`, {
        cwd: tmpDir,
        stdio: "pipe",
      })
    ).toThrow();
  });

  it("init --force overwrites", () => {
    fs.writeFileSync(path.join(tmpDir, "chrome-ranger.yaml"), "old");
    execSync(`node ${cliPath} init --force`, {
      cwd: tmpDir,
    });
    const content = fs.readFileSync(
      path.join(tmpDir, "chrome-ranger.yaml"),
      "utf-8"
    );
    expect(content).toContain("command:");
  });
});
