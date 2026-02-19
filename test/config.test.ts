import { describe, it, expect } from "vitest";
import { parseConfig, type Config } from "../src/config.js";

describe("Config Parsing", () => {
  describe("valid config", () => {
    it("parses a complete config with all fields", () => {
      const yaml = `
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
`;
      const config = parseConfig(yaml);
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

    it("applies default values when optional fields omitted", () => {
      const yaml = `
command: echo hello
iterations: 3
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`;
      const config = parseConfig(yaml);
      expect(config.workers).toBe(1);
      expect(config.warmup).toBe(0);
      expect(config.setup).toBeUndefined();
    });

    it("setup is optional", () => {
      const yaml = `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`;
      const config = parseConfig(yaml);
      expect(config.setup).toBeUndefined();
    });
  });

  describe("invalid config", () => {
    it("throws on missing command", () => {
      const yaml = `
iterations: 5
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`;
      expect(() => parseConfig(yaml)).toThrow(/command/i);
    });

    it("throws on missing chrome.versions", () => {
      const yaml = `
command: echo hello
iterations: 5
chrome: {}
code:
  repo: .
  refs:
    - main
`;
      expect(() => parseConfig(yaml)).toThrow(/chrome\.versions/i);
    });

    it("throws on missing code.refs", () => {
      const yaml = `
command: echo hello
iterations: 5
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
`;
      expect(() => parseConfig(yaml)).toThrow(/code\.refs/i);
    });

    it("throws on empty chrome.versions array", () => {
      const yaml = `
command: echo hello
iterations: 5
chrome:
  versions: []
code:
  repo: .
  refs:
    - main
`;
      expect(() => parseConfig(yaml)).toThrow(/chrome\.versions/i);
    });

    it("throws on empty code.refs array", () => {
      const yaml = `
command: echo hello
iterations: 5
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs: []
`;
      expect(() => parseConfig(yaml)).toThrow(/code\.refs/i);
    });

    it("throws on iterations <= 0", () => {
      const yaml = `
command: echo hello
iterations: 0
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
`;
      expect(() => parseConfig(yaml)).toThrow(/iterations/i);
    });

    it("throws on workers <= 0", () => {
      const yaml = `
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
`;
      expect(() => parseConfig(yaml)).toThrow(/workers/i);
    });

    it("throws on warmup < 0", () => {
      const yaml = `
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
`;
      expect(() => parseConfig(yaml)).toThrow(/warmup/i);
    });

    it("throws on malformed YAML", () => {
      const yaml = `{{{not yaml`;
      expect(() => parseConfig(yaml)).toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles Chrome version strings with various formats", () => {
      const yaml = `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
    - "121.0.6167.85"
code:
  repo: .
  refs:
    - main
`;
      const config = parseConfig(yaml);
      expect(config.chrome.versions).toEqual([
        "120.0.6099.109",
        "121.0.6167.85",
      ]);
    });

    it("handles ref names with slashes, dots, hyphens", () => {
      const yaml = `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
code:
  repo: .
  refs:
    - main
    - feature/virtual-list
    - v4.5.0
    - release-candidate
`;
      const config = parseConfig(yaml);
      expect(config.code.refs).toEqual([
        "main",
        "feature/virtual-list",
        "v4.5.0",
        "release-candidate",
      ]);
    });

    it("handles chrome.cache_dir override", () => {
      const yaml = `
command: echo hello
iterations: 1
chrome:
  versions:
    - "120.0.6099.109"
  cache_dir: /tmp/my-chrome-cache
code:
  repo: .
  refs:
    - main
`;
      const config = parseConfig(yaml);
      expect(config.chrome.cache_dir).toBe("/tmp/my-chrome-cache");
    });
  });
});
