import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CLI Integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cli --help shows usage", () => {
    const result = execSync("npx tsx src/cli.ts --help", {
      cwd: "/home/user/chrome-ranger",
    }).toString();
    expect(result).toContain("chrome-ranger");
  });

  it("init creates chrome-ranger.yaml", () => {
    execSync("npx tsx /home/user/chrome-ranger/src/cli.ts init", {
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, "chrome-ranger.yaml"))).toBe(true);
  });

  it("init refuses overwrite without --force", () => {
    fs.writeFileSync(path.join(tmpDir, "chrome-ranger.yaml"), "existing");
    expect(() =>
      execSync("npx tsx /home/user/chrome-ranger/src/cli.ts init", {
        cwd: tmpDir,
        stdio: "pipe",
      })
    ).toThrow();
  });

  it("init --force overwrites", () => {
    fs.writeFileSync(path.join(tmpDir, "chrome-ranger.yaml"), "old");
    execSync("npx tsx /home/user/chrome-ranger/src/cli.ts init --force", {
      cwd: tmpDir,
    });
    const content = fs.readFileSync(
      path.join(tmpDir, "chrome-ranger.yaml"),
      "utf-8"
    );
    expect(content).toContain("command:");
  });
});
