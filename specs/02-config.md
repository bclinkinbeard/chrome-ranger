# Spec 02: Config Parsing

## Purpose

Load and validate `chrome-ranger.yaml` from the project root. Produce a strongly-typed `Config` object or throw a clear error. This module is pure — no side effects beyond reading the file.

## Public Interface

### Types

```typescript
interface Config {
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
```

### Functions

```typescript
/**
 * Load and validate config from the given path.
 * Throws ConfigError with a human-readable message on failure.
 */
function loadConfig(filePath: string): Promise<Config>;

/**
 * Validate a raw parsed object against the config schema.
 * Returns a validated Config or throws ConfigError.
 */
function validateConfig(raw: unknown): Config;
```

### Error type

```typescript
class ConfigError extends Error {
  constructor(message: string);
}
```

## Behavior

1. Read the file at `filePath`. If it doesn't exist, throw `ConfigError` with message: `Config file not found: {filePath}. Run "chrome-ranger init" to create one.`
2. Parse as YAML via `js-yaml`. If parsing fails, throw `ConfigError` with message: `Invalid YAML in {filePath}: {yamlError}`
3. Validate the parsed object (see rules below)
4. Apply defaults: `workers` defaults to `1`, `warmup` defaults to `0`
5. Return the validated `Config`

### Validation Rules

| Field | Rule | Error message |
|---|---|---|
| `command` | Required, non-empty string | `"command" is required` |
| `setup` | Optional string | — |
| `iterations` | Required, integer > 0 | `"iterations" must be a positive integer` |
| `warmup` | Optional, integer >= 0 | `"warmup" must be a non-negative integer` |
| `workers` | Optional, integer > 0 | `"workers" must be a positive integer` |
| `chrome` | Required object | `"chrome" section is required` |
| `chrome.versions` | Required, non-empty array of strings | `"chrome.versions" must be a non-empty array of version strings` |
| `chrome.cache_dir` | Optional string | — |
| `code` | Required object | `"code" section is required` |
| `code.repo` | Required, non-empty string | `"code.repo" is required` |
| `code.refs` | Required, non-empty array of strings | `"code.refs" must be a non-empty array of ref strings` |

## Edge Cases

- Extra/unknown fields in the YAML are silently ignored (no error)
- `chrome.versions` items must be strings — a bare number like `120` in YAML is coerced to string, not rejected
- Duplicate entries in `chrome.versions` or `code.refs` are allowed (no deduplication)
- `code.repo` value `.` is valid (means current directory)
- Ref names can contain slashes (`feature/foo`), dots (`v4.5.0`), hyphens

## Acceptance Criteria

- [ ] Parses a complete valid config and returns all fields
- [ ] Applies default `workers: 1` when omitted
- [ ] Applies default `warmup: 0` when omitted
- [ ] Config without `setup` is valid
- [ ] Missing `command` → `ConfigError` with descriptive message
- [ ] Missing `chrome.versions` → `ConfigError`
- [ ] Empty `chrome.versions` array → `ConfigError`
- [ ] Missing `code.refs` → `ConfigError`
- [ ] Empty `code.refs` array → `ConfigError`
- [ ] `iterations: 0` → `ConfigError`
- [ ] `iterations: -1` → `ConfigError`
- [ ] `workers: 0` → `ConfigError`
- [ ] `warmup: -1` → `ConfigError`
- [ ] Non-existent file → `ConfigError` mentioning `chrome-ranger init`
- [ ] Malformed YAML → `ConfigError` with parse error details
- [ ] Extra fields in YAML don't cause errors
