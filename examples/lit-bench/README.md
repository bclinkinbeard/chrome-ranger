# Lit Benchmark Example

Benchmark [Lit](https://github.com/lit/lit) template rendering across multiple release tags and Chrome versions using chrome-ranger.

This example measures: "Did Lit's template rendering get faster or slower between `lit@3.0.0` and `lit@3.2.0`, and does the answer change depending on the Chrome version?"

## What's happening

chrome-ranger runs the `bench.sh` script against every cell in a Chrome version x git ref matrix. The script uses [Tachometer](https://github.com/google/tachometer) to measure the `kitchen-sink` lit-html benchmark — a comprehensive template rendering stress test that exercises all of lit-html's features.

Each cell runs 5 iterations (plus 1 warmup that's discarded). Each iteration takes 20 Tachometer samples, yielding ~100 data points per cell.

```
                     lit@3.0.0       lit@3.2.0
Chrome 130.x.xxxx   5 iterations    5 iterations
Chrome 134.x.xxxx   5 iterations    5 iterations
```

Total: 4 cells x 5 iterations = 20 runs + 4 warmup = 24 script executions.

## Prerequisites

- Node.js >= 18
- chrome-ranger installed (`npm install -g chrome-ranger`)

## Setup

Run the setup script — it clones Lit and copies the config + bench script into the clone:

```bash
./setup.sh
cd lit
```

Optionally find different Chrome versions to test against:

```bash
chrome-ranger list-chrome --latest 10
```

Then update `chrome.versions` in `chrome-ranger.yaml` with exact version strings from the output above.

You can also adjust `code.refs` to compare different Lit releases. Tags use the monorepo format: `lit@3.0.0`, `lit@3.1.0`, etc.

## Run

From inside the `lit/` directory:

```bash
chrome-ranger run
```

This will:
1. Create git worktrees for each ref (`lit@3.0.0`, `lit@3.2.0`)
2. Run `npm ci && npm run build` in each worktree
3. Download the specified Chrome versions (cached for future runs)
4. Execute 1 warmup + 5 measured iterations per (Chrome, ref) cell
5. Capture all Tachometer JSON output to `.chrome-ranger/output/`

Check progress:

```bash
chrome-ranger status
```

If a run is interrupted or some iterations fail, just run `chrome-ranger run` again — it picks up where it left off.

## Analyze results

chrome-ranger captures raw output but doesn't analyze it. Use `jq` to extract timing data from the captured Tachometer JSON:

```bash
# List all result files with their chrome version and ref
cat .chrome-ranger/runs.jsonl | jq -r '[.chrome, .ref, .id, .exitCode] | @tsv'

# Extract mean durations from a specific run
cat .chrome-ranger/output/<id>.stdout | jq '.benchmarks[0].mean'

# Aggregate across all successful runs
for f in .chrome-ranger/output/*.stdout; do
  id=$(basename "$f" .stdout)
  meta=$(grep "$id" .chrome-ranger/runs.jsonl)
  chrome=$(echo "$meta" | jq -r '.chrome')
  ref=$(echo "$meta" | jq -r '.ref')
  mean=$(cat "$f" | jq '.benchmarks[0].mean.low // empty' 2>/dev/null)
  [ -n "$mean" ] && echo -e "$chrome\t$ref\t$mean"
done | sort
```

Or pull `runs.jsonl` and the output files into a notebook for charting.

## Chromedriver note

Tachometer uses WebDriver under the hood, which requires a chromedriver version matching the Chrome binary. The `bench.sh` script handles this automatically by installing the matching chromedriver via `@puppeteer/browsers` before running Tachometer.
