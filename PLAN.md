# Plan: Lit Benchmark Example

## Goal

Add an example to the chrome-ranger repo showing how to benchmark [Lit](https://github.com/lit/lit) across multiple release tags and Chrome versions. This exercises chrome-ranger's full matrix: `chrome.versions × code.refs`.

## Why Lit

After researching 25+ projects (see BENCHMARK-PROJECTS.md), Lit is the best fit:

1. **Native custom Chrome support** — Lit uses [Tachometer](https://github.com/google/tachometer) which has a first-class `browser.binary` config field. No patching needed.
2. **Well-structured benchmarks** — `packages/benchmarks/` has individual `tachometer.json` configs for each benchmark (lit-html kitchen-sink, lit-element list, reactive-element list).
3. **Real library people care about** — Google's web components framework, ~21k GitHub stars, 560+ release tags.
4. **Simple build** — `npm ci && npm run build` in a monorepo. No Bazel, no exotic toolchain.

### Why not React?

The earlier research overstated React's fit. Deeper investigation found:
- `chrome-launcher` does **not** read `CHROME_PATH` — it expects Chrome in the system PATH
- Benchmark dependencies are from 2018 (`lighthouse@^3.2.1`, `chrome-launcher@^0.10.5`)
- Would need significant patching to accept a custom Chrome binary

### Chromedriver caveat

Tachometer uses WebDriver under the hood, which requires a chromedriver version matching the Chrome binary. The bench script handles this by installing the matching chromedriver via `@puppeteer/browsers` before running Tachometer.

## What we're measuring

"Did Lit's template rendering get faster or slower between lit@3.0.0 and lit@3.2.0, and does the answer change depending on the Chrome version?"

## Files to add

```
examples/
  lit-bench/
    README.md              # Step-by-step setup and usage instructions
    chrome-ranger.yaml     # Config file (user copies into their Lit clone)
    bench.sh               # Benchmark runner script
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
    - "130.0.6723.58"     # placeholders — look up via `chrome-ranger list-chrome`
    - "134.0.6998.35"

code:
  repo: .
  refs:
    - "lit@3.0.0"         # verify exact tag format in the Lit repo
    - "lit@3.2.0"
```

Notes:
- Chrome version strings are placeholders — actual values need to be looked up via `chrome-ranger list-chrome`
- Lit tag format needs verification (monorepo tags are typically `lit@3.0.0`, `lit-html@3.0.0`, etc.)
- `workers: 1` because benchmark timing is sensitive to CPU contention

## bench.sh

The wrapper script runs inside the Lit worktree with `CHROME_BIN`, `CHROME_VERSION`, `CODE_REF`, etc. set as env vars.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Install matching chromedriver for this Chrome version.
# Tachometer uses WebDriver, so chromedriver must match the Chrome binary.
CHROMEDRIVER_PATH=$(npx --yes @puppeteer/browsers install chromedriver@"$CHROME_VERSION" \
  --path /tmp/chromedriver-cache 2>/dev/null | tail -1)

# Generate a Tachometer config that uses chrome-ranger's Chrome binary
CONFIG=$(mktemp /tmp/tach-XXXXXX.json)
trap "rm -f $CONFIG" EXIT

cat > "$CONFIG" << EOF
{
  "sampleSize": 20,
  "timeout": 0,
  "benchmarks": [
    {
      "url": "packages/benchmarks/lit-html/kitchen-sink/index.html",
      "measurement": [
        { "mode": "performance", "entryName": "kitchen-sink" }
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

# Run Tachometer. JSON output to stdout, progress noise to stderr.
CHROMEDRIVER_PATH="$CHROMEDRIVER_PATH" \
  npx tachometer --config "$CONFIG" --json-file /dev/stdout 2>/dev/null
```

Key decisions:
- `sampleSize: 20` — Tachometer takes 20 samples per invocation. With chrome-ranger `iterations: 5`, we get 100 total data points per cell.
- `timeout: 0` — Don't auto-extend sampling; take exactly 20 samples and stop.
- `headless: true` — No display needed.
- `--json-file /dev/stdout` — Pipe structured JSON to stdout so chrome-ranger captures it.
- `2>/dev/null` — Suppress Tachometer's progress table (chrome-ranger captures stderr separately anyway).
- Chromedriver installed per-run to match the exact Chrome version. Cached in `/tmp/chromedriver-cache` so repeated runs don't re-download.

**Fallback: puppeteer-core runner** if Tachometer's WebDriver layer has compatibility issues with certain Chrome versions. Would be a ~30-line Node script that:
1. Launches Chrome via `puppeteer-core` with `executablePath: process.env.CHROME_BIN`
2. Serves the benchmark HTML via a simple HTTP server
3. Navigates to the page, waits for `performance.getEntriesByName('kitchen-sink')`
4. Prints JSON to stdout

## README.md contents

1. **Prerequisites**: Node.js >= 18, chrome-ranger installed
2. **Setup steps**:
   - Clone Lit: `git clone https://github.com/lit/lit.git && cd lit`
   - Copy `chrome-ranger.yaml` and `bench.sh` into the clone root
   - Run `chrome-ranger list-chrome --latest 10` to find available Chrome versions
   - Update `chrome.versions` in the config with exact version strings
   - Optionally adjust `code.refs` to compare different Lit releases
3. **Run**: `chrome-ranger run`
4. **Analyze**: Example `jq` commands to extract timing data from captured stdout files
5. **What's happening**: Brief explanation of the matrix, the benchmark (kitchen-sink), and what the numbers mean

## Things to verify during implementation

1. **Lit git tag format** — Monorepo tags are typically scoped like `lit@3.0.0`. Verify these exist and that git worktree checkout works with the `@` character.
2. **Benchmark HTML location** — Verify `packages/benchmarks/lit-html/kitchen-sink/index.html` is the correct path and that it uses `performance.mark`/`performance.measure`.
3. **Tachometer config schema** — Verify the exact JSON format for `browser.binary`, `measurement`, and benchmark URLs against Tachometer's docs.
4. **Chromedriver matching** — Verify that `@puppeteer/browsers install chromedriver@<version>` works with the same version string as Chrome, and that Tachometer can find chromedriver via `CHROMEDRIVER_PATH` or similar env var.
5. **Build output** — Does `npm run build` produce what the benchmarks need? Do benchmarks import from built output or source?
6. **Which benchmark** — `kitchen-sink` is the most comprehensive lit-html benchmark. Verify it exists at both chosen tags.
7. **Available Chrome versions** — The version strings in the config are placeholders. Need actual versions from `chrome-ranger list-chrome`.

## Matrix visualization

```
                     lit@3.0.0       lit@3.2.0
Chrome 130.x.xxxx   5 iterations    5 iterations
Chrome 134.x.xxxx   5 iterations    5 iterations
```

Total: 4 cells × 5 iterations = 20 runs + 4 warmup = 24 script executions.
Each execution: Tachometer takes 20 samples, so ~480 total data points.
