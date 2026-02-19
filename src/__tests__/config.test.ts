import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, validateConfig, ConfigError } from "../config.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-config-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const p = path.join(tmpDir, "chrome-ranger.yaml");
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

const validYaml = `
command: npx playwright test
setup: npm ci
iterations: 5
warmup: 1
workers: 2

chrome:
  versions:
    - "120.0.6099.109"
    - "121.0.6167.85"

code:
  repo: .
  refs:
    - main
    - v4.5.0
`;

describe("loadConfig", () => {
  it("parses a complete valid config", async () => {
    const p = path.join(tmpDir, "chrome-ranger.yaml");
    await fs.writeFile(p, validYaml);
    const config = await loadConfig(p);

    expect(config.command).toBe("npx playwright test");
    expect(config.setup).toBe("npm ci");
    expect(config.iterations).toBe(5);
    expect(config.warmup).toBe(1);
    expect(config.workers).toBe(2);
    expect(config.chrome.versions).toEqual(["120.0.6099.109", "121.0.6167.85"]);
    expect(config.code.repo).toBe(".");
    expect(config.code.refs).toEqual(["main", "v4.5.0"]);
  });

  it("applies default workers: 1 when omitted", async () => {
    const yaml = `
command: echo test
iterations: 1
chrome:
  versions: ["120"]
code:
  repo: .
  refs: [main]
`;
    const p = path.join(tmpDir, "chrome-ranger.yaml");
    await fs.writeFile(p, yaml);
    const config = await loadConfig(p);
    expect(config.workers).toBe(1);
  });

  it("applies default warmup: 0 when omitted", async () => {
    const yaml = `
command: echo test
iterations: 1
chrome:
  versions: ["120"]
code:
  repo: .
  refs: [main]
`;
    const p = path.join(tmpDir, "chrome-ranger.yaml");
    await fs.writeFile(p, yaml);
    const config = await loadConfig(p);
    expect(config.warmup).toBe(0);
  });

  it("config without setup is valid", async () => {
    const yaml = `
command: echo test
iterations: 1
chrome:
  versions: ["120"]
code:
  repo: .
  refs: [main]
`;
    const p = path.join(tmpDir, "chrome-ranger.yaml");
    await fs.writeFile(p, yaml);
    const config = await loadConfig(p);
    expect(config.setup).toBeUndefined();
  });

  it("throws ConfigError for non-existent file", async () => {
    const p = path.join(tmpDir, "nonexistent.yaml");
    await expect(loadConfig(p)).rejects.toThrow(ConfigError);
    await expect(loadConfig(p)).rejects.toThrow("chrome-ranger init");
  });

  it("throws ConfigError for malformed YAML", async () => {
    const p = path.join(tmpDir, "bad.yaml");
    await fs.writeFile(p, "{{{{invalid yaml!!!: [");
    await expect(loadConfig(p)).rejects.toThrow(ConfigError);
    await expect(loadConfig(p)).rejects.toThrow("Invalid YAML");
  });
});

describe("validateConfig", () => {
  it("throws for missing command", () => {
    expect(() =>
      validateConfig({ iterations: 1, chrome: { versions: ["120"] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"command" is required');
  });

  it("throws for missing chrome.versions", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, chrome: {}, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"chrome.versions" must be a non-empty array');
  });

  it("throws for empty chrome.versions array", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, chrome: { versions: [] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"chrome.versions" must be a non-empty array');
  });

  it("throws for missing code.refs", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, chrome: { versions: ["120"] }, code: { repo: "." } }),
    ).toThrow('"code.refs" must be a non-empty array');
  });

  it("throws for empty code.refs array", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, chrome: { versions: ["120"] }, code: { repo: ".", refs: [] } }),
    ).toThrow('"code.refs" must be a non-empty array');
  });

  it("throws for iterations: 0", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 0, chrome: { versions: ["120"] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"iterations" must be a positive integer');
  });

  it("throws for iterations: -1", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: -1, chrome: { versions: ["120"] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"iterations" must be a positive integer');
  });

  it("throws for workers: 0", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, workers: 0, chrome: { versions: ["120"] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"workers" must be a positive integer');
  });

  it("throws for warmup: -1", () => {
    expect(() =>
      validateConfig({ command: "test", iterations: 1, warmup: -1, chrome: { versions: ["120"] }, code: { repo: ".", refs: ["main"] } }),
    ).toThrow('"warmup" must be a non-negative integer');
  });

  it("ignores extra fields", () => {
    const config = validateConfig({
      command: "test",
      iterations: 1,
      extraField: "hello",
      chrome: { versions: ["120"] },
      code: { repo: ".", refs: ["main"] },
    });
    expect(config.command).toBe("test");
  });

  it("coerces numeric chrome versions to strings", () => {
    const config = validateConfig({
      command: "test",
      iterations: 1,
      chrome: { versions: [120] },
      code: { repo: ".", refs: ["main"] },
    });
    expect(config.chrome.versions).toEqual(["120"]);
  });
});
