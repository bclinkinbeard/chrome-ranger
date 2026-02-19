import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { Config } from "./types.js";

const CONFIG_FILENAME = "chrome-ranger.yaml";

export function findConfigPath(cwd: string): string {
  return resolve(cwd, CONFIG_FILENAME);
}

export function parseConfig(filePath: string): Config {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Config file not found: ${filePath}\nRun 'chrome-ranger init' to create one.`,
      );
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch {
    throw new Error(`Invalid YAML in ${filePath}`);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config file must be a YAML object`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.command !== "string" || !obj.command.trim()) {
    throw new Error(`Config: 'command' is required and must be a non-empty string`);
  }

  if (obj.setup !== undefined && typeof obj.setup !== "string") {
    throw new Error(`Config: 'setup' must be a string`);
  }

  if (typeof obj.iterations !== "number" || obj.iterations <= 0 || !Number.isInteger(obj.iterations)) {
    throw new Error(`Config: 'iterations' must be a positive integer`);
  }

  const warmup = obj.warmup !== undefined ? obj.warmup : 0;
  if (typeof warmup !== "number" || warmup < 0 || !Number.isInteger(warmup)) {
    throw new Error(`Config: 'warmup' must be a non-negative integer`);
  }

  const workers = obj.workers !== undefined ? obj.workers : 1;
  if (typeof workers !== "number" || workers <= 0 || !Number.isInteger(workers)) {
    throw new Error(`Config: 'workers' must be a positive integer`);
  }

  if (typeof obj.chrome !== "object" || obj.chrome === null) {
    throw new Error(`Config: 'chrome' section is required`);
  }
  const chrome = obj.chrome as Record<string, unknown>;
  if (!Array.isArray(chrome.versions) || chrome.versions.length === 0) {
    throw new Error(`Config: 'chrome.versions' must be a non-empty array`);
  }
  for (const v of chrome.versions) {
    if (typeof v !== "string" || !v.trim()) {
      throw new Error(`Config: each Chrome version must be a non-empty string`);
    }
  }

  if (typeof obj.code !== "object" || obj.code === null) {
    throw new Error(`Config: 'code' section is required`);
  }
  const code = obj.code as Record<string, unknown>;
  if (typeof code.repo !== "string" || !code.repo.trim()) {
    throw new Error(`Config: 'code.repo' is required`);
  }
  if (!Array.isArray(code.refs) || code.refs.length === 0) {
    throw new Error(`Config: 'code.refs' must be a non-empty array`);
  }
  for (const r of code.refs) {
    if (typeof r !== "string" || !r.trim()) {
      throw new Error(`Config: each ref must be a non-empty string`);
    }
  }

  return {
    command: obj.command,
    setup: obj.setup as string | undefined,
    iterations: obj.iterations,
    warmup,
    workers,
    chrome: {
      versions: chrome.versions as string[],
      cache_dir: chrome.cache_dir as string | undefined,
    },
    code: {
      repo: code.repo as string,
      refs: code.refs as string[],
    },
  };
}

export const DEFAULT_CONFIG = `command: npx playwright test
setup: npm ci
iterations: 5
warmup: 1
workers: 1

chrome:
  versions:
    - "120.0.6099.109"

code:
  repo: .
  refs:
    - main
`;
