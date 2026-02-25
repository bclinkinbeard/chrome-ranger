import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseConfig } from "../src/config.js";

const EXAMPLE_DIR = resolve(import.meta.dirname, "../examples/lit-bench");

describe("Lit Bench Example", () => {
  describe("chrome-ranger.yaml", () => {
    it("exists and is readable", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      expect(content).toBeTruthy();
    });

    it("is valid chrome-ranger config", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config).toBeDefined();
    });

    it("command runs bench.sh via bash", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.command).toBe("bash bench.sh");
    });

    it("has setup command for npm ci and build", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.setup).toContain("npm ci");
      expect(config.setup).toContain("npm run build");
    });

    it("has 5 iterations", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.iterations).toBe(5);
    });

    it("has 1 warmup iteration", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.warmup).toBe(1);
    });

    it("has 1 worker (benchmarks are timing-sensitive)", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.workers).toBe(1);
    });

    it("has exactly 2 Chrome versions", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.chrome.versions).toHaveLength(2);
    });

    it("Chrome versions are 4-part version strings", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      for (const v of config.chrome.versions) {
        expect(v).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      }
    });

    it("has exactly 2 code refs", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.code.refs).toHaveLength(2);
    });

    it("refs are Lit release tags (lit@x.y.z format)", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      for (const ref of config.code.refs) {
        expect(ref).toMatch(/^lit@\d+\.\d+\.\d+$/);
      }
    });

    it("refs include lit@3.0.0 and lit@3.2.0", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.code.refs).toContain("lit@3.0.0");
      expect(config.code.refs).toContain("lit@3.2.0");
    });

    it("repo is set to current directory", () => {
      const raw = readFileSync(resolve(EXAMPLE_DIR, "chrome-ranger.yaml"), "utf-8");
      const config = parseConfig(raw);
      expect(config.code.repo).toBe(".");
    });
  });

  describe("bench.sh", () => {
    it("exists and is readable", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toBeTruthy();
    });

    it("starts with bash shebang", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    });

    it("uses strict mode (set -euo pipefail)", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("references CHROME_BIN env var", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("CHROME_BIN");
    });

    it("references CHROME_VERSION env var", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("CHROME_VERSION");
    });

    it("installs matching chromedriver", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("@puppeteer/browsers");
      expect(content).toContain("chromedriver");
    });

    it("generates a Tachometer config", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("tachometer");
      expect(content).toContain("sampleSize");
    });

    it("uses headless Chrome", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("headless");
    });

    it("targets kitchen-sink benchmark", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("kitchen-sink");
    });

    it("outputs JSON to stdout", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("--json-file");
      expect(content).toContain("/dev/stdout");
    });

    it("cleans up temp config on exit", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "bench.sh"), "utf-8");
      expect(content).toContain("trap");
    });
  });

  describe("README.md", () => {
    it("exists and is readable", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toBeTruthy();
    });

    it("has a title mentioning Lit", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/^#\s+.*Lit/m);
    });

    it("has Prerequisites section", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/##\s+.*Prerequisites/i);
    });

    it("mentions Node.js >= 18 prerequisite", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/Node\.?js.*18/i);
    });

    it("has Setup section with clone instructions", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/##\s+.*Setup/i);
      expect(content).toContain("git clone");
      expect(content).toContain("github.com/lit/lit");
    });

    it("mentions list-chrome for finding versions", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toContain("list-chrome");
    });

    it("has Run section", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/##\s+.*Run/i);
      expect(content).toContain("chrome-ranger run");
    });

    it("has Analyze section with jq examples", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toMatch(/##\s+.*Analy/i);
      expect(content).toContain("jq");
    });

    it("explains what the benchmark measures", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toContain("kitchen-sink");
      expect(content).toContain("Tachometer");
    });

    it("documents the matrix structure", () => {
      const content = readFileSync(resolve(EXAMPLE_DIR, "README.md"), "utf-8");
      expect(content).toContain("lit@3.0.0");
      expect(content).toContain("lit@3.2.0");
    });
  });
});
