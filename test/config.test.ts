import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseConfig } from "../src/config.js";

const TMP = resolve(import.meta.dirname, ".tmp-config-test");

function writeYaml(name: string, content: string): string {
  const p = resolve(TMP, name);
  writeFileSync(p, content);
  return p;
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("config parsing", () => {
  it("parses a complete config", () => {
    const path = writeYaml(
      "full.yaml",
      `
command: npx playwright test
setup: npm ci
iterations: 5
warmup: 1
workers: 4
chrome:
  versions:
    - "120.0.6099.109"
    - "121.0.6167.85"
code:
  repo: .
  refs:
    - main
    - v4.5.0
`,
    );
    const config = parseConfig(path);
    expect(config.command).toBe("npx playwright test");
    expect(config.setup).toBe("npm ci");
    expect(config.iterations).toBe(5);
    expect(config.warmup).toBe(1);
    expect(config.workers).toBe(4);
    expect(config.chrome.versions).toEqual([
      "120.0.6099.109",
      "121.0.6167.85",
    ]);
    expect(config.code.repo).toBe(".");
    expect(config.code.refs).toEqual(["main", "v4.5.0"]);
  });

  it("applies defaults for workers and warmup", () => {
    const path = writeYaml(
      "minimal.yaml",
      `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`,
    );
    const config = parseConfig(path);
    expect(config.workers).toBe(1);
    expect(config.warmup).toBe(0);
    expect(config.setup).toBeUndefined();
  });

  it("rejects missing command", () => {
    const path = writeYaml(
      "no-cmd.yaml",
      `
iterations: 5
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`,
    );
    expect(() => parseConfig(path)).toThrow("command");
  });

  it("rejects empty chrome.versions", () => {
    const path = writeYaml(
      "empty-versions.yaml",
      `
command: echo hello
iterations: 5
chrome:
  versions: []
code:
  repo: .
  refs:
    - main
`,
    );
    expect(() => parseConfig(path)).toThrow("chrome.versions");
  });

  it("rejects empty code.refs", () => {
    const path = writeYaml(
      "empty-refs.yaml",
      `
command: echo hello
iterations: 5
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs: []
`,
    );
    expect(() => parseConfig(path)).toThrow("code.refs");
  });

  it("rejects iterations <= 0", () => {
    const path = writeYaml(
      "bad-iter.yaml",
      `
command: echo hello
iterations: 0
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`,
    );
    expect(() => parseConfig(path)).toThrow("iterations");
  });

  it("rejects workers <= 0", () => {
    const path = writeYaml(
      "bad-workers.yaml",
      `
command: echo hello
iterations: 5
workers: 0
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`,
    );
    expect(() => parseConfig(path)).toThrow("workers");
  });

  it("rejects warmup < 0", () => {
    const path = writeYaml(
      "bad-warmup.yaml",
      `
command: echo hello
iterations: 5
warmup: -1
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`,
    );
    expect(() => parseConfig(path)).toThrow("warmup");
  });

  it("throws on non-existent config file", () => {
    expect(() => parseConfig("/nonexistent/config.yaml")).toThrow(
      "Config file not found",
    );
  });

  it("throws on malformed YAML", () => {
    const path = writeYaml("bad.yaml", "}{not: yaml: at: all");
    expect(() => parseConfig(path)).toThrow("Invalid YAML");
  });

  it("handles ref names with slashes and dots", () => {
    const path = writeYaml(
      "fancy-refs.yaml",
      `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - feature/virtual-list
    - v4.5.0
    - release/2.0-rc1
`,
    );
    const config = parseConfig(path);
    expect(config.code.refs).toEqual([
      "feature/virtual-list",
      "v4.5.0",
      "release/2.0-rc1",
    ]);
  });
});
