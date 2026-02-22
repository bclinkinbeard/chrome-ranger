# Plan: Preact Benchmark Example

## Goal

Add an example to the chrome-ranger repo showing how to benchmark Preact across multiple release versions and Chrome versions. This exercises chrome-ranger's full matrix: `chrome.versions × code.refs`.

## What we're measuring

"Did Preact get faster or slower between v10.19.0 and v10.25.0, and does the answer change depending on the Chrome version?"

## Files to add

```
examples/
  preact-bench/
    README.md              # Step-by-step setup and usage instructions
    chrome-ranger.yaml     # Config file (user copies into their Preact clone)
    bench.sh               # Benchmark runner script (user copies into their Preact clone)
```

## chrome-ranger.yaml

```yaml
command: bash bench.sh
setup: npm ci && npm run build
iterations: 5
warmup: 1
workers: 1          # benchmarks are timing-sensitive; parallelism skews results

chrome:
  versions:
    - "130.0.6723.58"     # exact versions from `chrome-ranger list-chrome`
    - "134.0.6998.35"

code:
  repo: .
  refs:
    - "10.19.0"           # Preact release tags (verify exact format: 10.19.0 vs v10.19.0)
    - "10.25.0"
```

Notes:
- Chrome version strings are placeholders — actual values need to be looked up via `chrome-ranger list-chrome`
- Preact tag format needs verification (most npm packages use either `10.19.0` or `v10.19.0`)
- `workers: 1` because benchmark timing is sensitive to CPU contention

## bench.sh

The wrapper script runs inside the Preact worktree with `CHROME_BIN`, `CHROME_VERSION`, `CODE_REF`, etc. set as env vars.

**Approach: Use Tachometer** (already in Preact's devDependencies)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Generate a tachometer config that uses chrome-ranger's Chrome binary
CONFIG=$(mktemp /tmp/tach-XXXXXX.json)
trap "rm -f $CONFIG" EXIT

cat > "$CONFIG" << EOF
{
  "sampleSize": 20,
  "timeout": 0,
  "benchmarks": [
    {
      "url": "benches/replace1k/index.html",
      "measurement": [
        { "mode": "performance", "entryName": "replace1k" }
      ],
      "browser": {
        "name": "chrome",
        "binary": "$CHROME_BIN",
        "headless": true
      }
    }
  ]
}
EOF

npx tachometer --config "$CONFIG" --json-file /dev/stdout 2>/dev/null
```

Key decisions:
- `sampleSize: 20` — Tachometer takes 20 samples per invocation. With chrome-ranger `iterations: 5`, we get 100 total data points per cell.
- `timeout: 0` — Don't auto-extend sampling; take exactly 20 samples and stop.
- `headless: true` — No display needed.
- `--json-file /dev/stdout` — Pipe structured JSON to stdout so chrome-ranger captures it.
- `2>/dev/null` — Suppress Tachometer's progress table (chrome-ranger captures stderr separately anyway, but the table is noise).

**Fallback: puppeteer-core runner** if Tachometer's WebDriver layer has Chrome version compatibility issues. Would be a ~30-line Node script that:
1. Launches Chrome via `puppeteer-core` with `executablePath: process.env.CHROME_BIN`
2. Serves `benches/replace1k/index.html` via a simple HTTP server
3. Navigates to the page, waits for `performance.getEntriesByName('replace1k')`
4. Prints JSON to stdout

## README.md contents

1. **Prerequisites**: Node.js >= 18, chrome-ranger installed
2. **Setup steps**:
   - Clone Preact: `git clone https://github.com/preactjs/preact.git && cd preact`
   - Copy `chrome-ranger.yaml` and `bench.sh` into the clone root
   - Run `chrome-ranger list-chrome --latest 10` to find available Chrome versions
   - Update `chrome.versions` in the config with exact version strings
   - Optionally adjust `code.refs` to compare different Preact releases
3. **Run**: `chrome-ranger run`
4. **Analyze**: Example `jq` commands to extract timing data from captured stdout files
5. **What's happening**: Brief explanation of the matrix, the benchmark (replace1k), and what the numbers mean

## Things to verify during implementation

1. **Preact git tag format** — Are tags `10.19.0` or `v10.19.0`?
2. **Benchmark HTML location** — Is it `benches/replace1k/index.html` or `benches/replace1k.html`?
3. **Tachometer config schema** — Verify the exact JSON format for `browser.binary`, `measurement`, and benchmark URLs
4. **Tachometer's Chrome compatibility** — Does Tachometer use WebDriver (requires matching ChromeDriver) or CDP? If WebDriver, we may need the puppeteer-core fallback.
5. **Build output** — Does `npm run build` produce what the benchmarks need? Do benchmarks import from `dist/` or `src/`?
6. **Which benchmark** — `replace1k` is a good default (DOM-heavy, fast). Verify it exists at the chosen Preact tags.
7. **Available Chrome versions** — The version strings in the config are placeholders. Need actual versions from `@puppeteer/browsers` / Chrome for Testing API.

## Matrix visualization

```
                     10.19.0         10.25.0
Chrome 130.x.xxxx   5 iterations    5 iterations
Chrome 134.x.xxxx   5 iterations    5 iterations
```

Total: 4 cells × 5 iterations = 20 runs + 4 warmup = 24 script executions.
Each execution: Tachometer takes ~20 samples, so ~480 total data points.
Estimated wall time: ~10-15 minutes.
