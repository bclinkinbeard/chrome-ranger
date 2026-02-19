import yaml from "js-yaml";

export interface Config {
  command: string;
  setup?: string;
  iterations: number;
  warmup: number;
  workers: number;
  chrome: {
    versions: string[];
    cache_dir?: string;
  };
  code: {
    repo: string;
    refs: string[];
  };
}

export function parseConfig(raw: string): Config {
  const doc = yaml.load(raw) as Record<string, unknown>;

  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid config: expected a YAML object");
  }

  if (typeof doc.command !== "string" || !doc.command) {
    throw new Error("Invalid config: 'command' is required and must be a string");
  }

  const setup = doc.setup != null ? String(doc.setup) : undefined;

  const iterations = doc.iterations != null ? Number(doc.iterations) : undefined;
  if (iterations == null || !Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("Invalid config: 'iterations' must be a positive integer");
  }

  const warmup = doc.warmup != null ? Number(doc.warmup) : 0;
  if (!Number.isInteger(warmup) || warmup < 0) {
    throw new Error("Invalid config: 'warmup' must be a non-negative integer");
  }

  const workers = doc.workers != null ? Number(doc.workers) : 1;
  if (!Number.isInteger(workers) || workers <= 0) {
    throw new Error("Invalid config: 'workers' must be a positive integer");
  }

  const chrome = doc.chrome as Record<string, unknown> | undefined;
  if (!chrome || typeof chrome !== "object") {
    throw new Error("Invalid config: 'chrome' section is required");
  }
  if (!Array.isArray(chrome.versions) || chrome.versions.length === 0) {
    throw new Error(
      "Invalid config: 'chrome.versions' must be a non-empty array"
    );
  }
  const chromeVersions = chrome.versions.map(String);
  const cacheDir =
    chrome.cache_dir != null ? String(chrome.cache_dir) : undefined;

  const code = doc.code as Record<string, unknown> | undefined;
  if (!code || typeof code !== "object") {
    throw new Error("Invalid config: 'code' section is required");
  }
  if (!Array.isArray(code.refs) || code.refs.length === 0) {
    throw new Error("Invalid config: 'code.refs' must be a non-empty array");
  }
  const repo = code.repo != null ? String(code.repo) : ".";
  const refs = code.refs.map(String);

  return {
    command: doc.command,
    setup,
    iterations,
    warmup,
    workers,
    chrome: {
      versions: chromeVersions,
      ...(cacheDir != null && { cache_dir: cacheDir }),
    },
    code: {
      repo,
      refs,
    },
  };
}
