import * as fs from "node:fs/promises";
import * as yaml from "js-yaml";
import type { Config } from "./types.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(filePath: string): Promise<Config> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(
        `Config file not found: ${filePath}. Run "chrome-ranger init" to create one.`,
      );
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err: unknown) {
    throw new ConfigError(
      `Invalid YAML in ${filePath}: ${(err as Error).message}`,
    );
  }

  return validateConfig(raw);
}

export function validateConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Config must be a YAML object");
  }

  const obj = raw as Record<string, unknown>;

  // command
  if (typeof obj.command !== "string" || obj.command.length === 0) {
    throw new ConfigError('"command" is required');
  }

  // setup (optional)
  if (obj.setup !== undefined && typeof obj.setup !== "string") {
    throw new ConfigError('"setup" must be a string');
  }

  // iterations
  if (obj.iterations === undefined) {
    throw new ConfigError('"iterations" must be a positive integer');
  }
  if (
    typeof obj.iterations !== "number" ||
    !Number.isInteger(obj.iterations) ||
    obj.iterations <= 0
  ) {
    throw new ConfigError('"iterations" must be a positive integer');
  }

  // warmup (optional, defaults to 0)
  let warmup = 0;
  if (obj.warmup !== undefined) {
    if (
      typeof obj.warmup !== "number" ||
      !Number.isInteger(obj.warmup) ||
      obj.warmup < 0
    ) {
      throw new ConfigError('"warmup" must be a non-negative integer');
    }
    warmup = obj.warmup;
  }

  // workers (optional, defaults to 1)
  let workers = 1;
  if (obj.workers !== undefined) {
    if (
      typeof obj.workers !== "number" ||
      !Number.isInteger(obj.workers) ||
      obj.workers <= 0
    ) {
      throw new ConfigError('"workers" must be a positive integer');
    }
    workers = obj.workers;
  }

  // chrome
  if (typeof obj.chrome !== "object" || obj.chrome === null) {
    throw new ConfigError('"chrome" section is required');
  }
  const chrome = obj.chrome as Record<string, unknown>;
  if (!Array.isArray(chrome.versions) || chrome.versions.length === 0) {
    throw new ConfigError(
      '"chrome.versions" must be a non-empty array of version strings',
    );
  }
  const chromeVersions = chrome.versions.map((v: unknown) => String(v));

  let cacheDir: string | undefined;
  if (chrome.cache_dir !== undefined) {
    cacheDir = String(chrome.cache_dir);
  }

  // code
  if (typeof obj.code !== "object" || obj.code === null) {
    throw new ConfigError('"code" section is required');
  }
  const code = obj.code as Record<string, unknown>;
  if (typeof code.repo !== "string" || code.repo.length === 0) {
    throw new ConfigError('"code.repo" is required');
  }
  if (!Array.isArray(code.refs) || code.refs.length === 0) {
    throw new ConfigError(
      '"code.refs" must be a non-empty array of ref strings',
    );
  }
  const codeRefs = code.refs.map((r: unknown) => String(r));

  return {
    command: obj.command,
    setup: obj.setup as string | undefined,
    iterations: obj.iterations,
    warmup,
    workers,
    chrome: {
      versions: chromeVersions,
      cache_dir: cacheDir,
    },
    code: {
      repo: code.repo,
      refs: codeRefs,
    },
  };
}
