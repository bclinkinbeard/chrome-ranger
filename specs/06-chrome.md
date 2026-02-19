# Spec 06: Chrome Management

## Purpose

Download, cache, and locate Chrome binaries using `@puppeteer/browsers`. Query the Chrome for Testing availability API for version discovery. This module wraps the puppeteer/browsers library and handles cache directory resolution.

## Public Interface

```typescript
interface ChromeInstallation {
  version: string;
  executablePath: string;
}

interface ChromeVersionInfo {
  version: string;
  revision: string;
  channel: string;
}

/**
 * Ensure a Chrome binary for the given version is available.
 * Downloads if not cached. Returns the path to the executable.
 */
function ensureChrome(version: string, cacheDir: string): Promise<ChromeInstallation>;

/**
 * Resolve the cache directory.
 * Priority: config cache_dir > XDG_CACHE_HOME/chrome-ranger > ~/.cache/chrome-ranger
 */
function resolveCacheDir(configCacheDir?: string): string;

/**
 * Query Chrome for Testing API for available stable versions.
 */
function listChromeVersions(): Promise<ChromeVersionInfo[]>;

/**
 * Remove all cached Chrome binaries.
 */
function cleanCache(cacheDir: string): Promise<void>;
```

## Behavior

### `ensureChrome`

1. Use `@puppeteer/browsers` to check if the version is already installed in `cacheDir`
2. If cached, resolve and return the executable path
3. If not cached, download via `@puppeteer/browsers` `install()`:
   - Browser: `chrome`
   - Build ID: the version string
   - Cache directory: `cacheDir`
4. After download, resolve the executable path via `computeExecutablePath()`
5. Return `{ version, executablePath }`
6. If download fails (invalid version, network error), throw with message: `Failed to download Chrome {version}: {error}`

### `resolveCacheDir`

1. If `configCacheDir` is provided, use it (resolve relative to cwd)
2. Else if `XDG_CACHE_HOME` is set, use `{XDG_CACHE_HOME}/chrome-ranger`
3. Else use `~/.cache/chrome-ranger` (where `~` is `os.homedir()`)

### `listChromeVersions`

1. Fetch the Chrome for Testing availability JSON from the known endpoint
2. Filter to `stable` channel only
3. Return version info sorted by version descending (newest first)

### `cleanCache`

1. Remove the entire `cacheDir` directory recursively
2. No error if directory doesn't exist

## Edge Cases

- Chrome version string that doesn't exist in Chrome for Testing → download fails with clear error
- `cacheDir` doesn't exist → created during download
- `XDG_CACHE_HOME` is set to a relative path → resolved relative to cwd
- Network failure during download → error propagated with version in message
- `cleanCache` on non-existent directory → no error
- Multiple calls to `ensureChrome` for the same version → second call is a no-op (cached)

## Acceptance Criteria

- [ ] `ensureChrome` returns executable path for a cached binary (no network call)
- [ ] `ensureChrome` downloads and caches when not present (integration test, can be stubbed)
- [ ] `ensureChrome` throws with version in message when download fails
- [ ] `resolveCacheDir` uses config value when provided
- [ ] `resolveCacheDir` uses `XDG_CACHE_HOME` when set and no config value
- [ ] `resolveCacheDir` falls back to `~/.cache/chrome-ranger`
- [ ] `listChromeVersions` returns only stable channel versions
- [ ] `listChromeVersions` results are sorted newest first
- [ ] `cleanCache` removes the cache directory
- [ ] `cleanCache` is idempotent (no error if directory doesn't exist)

## Test Strategy

Stub `@puppeteer/browsers` in unit tests — don't make real network calls. Provide a thin wrapper that can be replaced in tests. The integration test (if desired) can download a real binary but should be tagged as slow/optional.
