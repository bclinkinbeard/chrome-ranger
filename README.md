# chrome-ranger

A CLI that runs your scripts against a matrix of **Chrome versions** and **git refs**. It manages Chrome downloads, git worktrees, parallel execution, and output capture. You bring the script; it handles the rest.

## Quick Start

```bash
chrome-ranger init          # scaffold chrome-ranger.yaml
chrome-ranger run            # execute the matrix
chrome-ranger status         # see what's done
```

## Config

```yaml
command: npx playwright test tests/bench.spec.ts
setup: npm ci
iterations: 5
warmup: 1
workers: 2

chrome:
  versions:
    - "120.0.6099.109"
    - "122.0.6261.94"

code:
  repo: .
  refs:
    - main
    - feature/virtual-list
```

| Field | Description |
|---|---|
| `command` | Shell command to run each iteration |
| `setup` | Runs once per worktree before first iteration |
| `iterations` | Minimum runs per matrix cell |
| `warmup` | Warmup iterations (not recorded) |
| `workers` | Parallel executions (default: 1) |
| `chrome.versions` | Chrome versions to test against |
| `code.repo` | Git repository path |
| `code.refs` | Branches, tags, or SHAs to test |

## Environment Variables

Your script receives these env vars:

| Variable | Description |
|---|---|
| `CHROME_BIN` | Absolute path to Chrome binary |
| `CHROME_VERSION` | Version string |
| `CODE_REF` | Git ref name as specified in config |
| `CODE_SHA` | Resolved commit SHA |
| `CODE_DIR` | Path to git worktree for this ref |
| `ITERATION` | Current iteration number (0-indexed) |

## Example: Benchmarking a React App

**`playwright.config.ts`** — point Playwright at the managed Chrome binary:

```typescript
export default defineConfig({
  use: {
    launchOptions: {
      executablePath: process.env.CHROME_BIN,
    },
  },
});
```

**`tests/bench.spec.ts`** — measure something, print to stdout:

```typescript
test('render 1000 rows', async ({ page }) => {
  await page.goto('http://localhost:3000');
  const start = performance.now();
  await page.click('#load-data');
  await page.waitForSelector('tr:nth-child(1000)');
  const duration = performance.now() - start;
  console.log(JSON.stringify({ metric: 'render_1000', ms: duration }));
});
```

**Run it:**

```
$ chrome-ranger run

Resolving refs...
  main        → e7f8a9b
  feature/virtual-list → 3c1d44f

Setting up worktrees...
  .chrome-ranger/worktrees/main              ✓
  .chrome-ranger/worktrees/feature-virtual-list ✓

Running setup: npm ci
  main (e7f8a9b)              ✓  12.4s
  feature/virtual-list (3c1d44f) ✓  11.8s

Ensuring Chrome binaries...
  chrome@120.0.6099.109       ✓  cached
  chrome@122.0.6261.94        ✓  downloading... done (48s)

Running 20 iterations + 4 warmup (2 workers)

  [warmup] chrome@120 × main (e7f8a9b)
  [warmup] chrome@120 × feature/virtual-list (3c1d44f)
  [warmup] chrome@122 × main (e7f8a9b)
  [warmup] chrome@122 × feature/virtual-list (3c1d44f)
  [ 1/20] chrome@120 × main (e7f8a9b) #0                    4523ms  exit:0
  [ 2/20] chrome@120 × feature/virtual-list (3c1d44f) #0     2301ms  exit:0
  ...
  [20/20] chrome@122 × feature/virtual-list (3c1d44f) #4     2210ms  exit:0

Done. 20 runs logged to .chrome-ranger/runs.jsonl
```

**Check status:**

```
$ chrome-ranger status

                        main (e7f8a9b)   feature/virtual-list (3c1d44f)
Chrome 120.0.6099.109  5/5 ✓             5/5 ✓
Chrome 122.0.6261.94   5/5 ✓             5/5 ✓
```

## Failure Handling

Failures don't abort the run. Other cells in the matrix keep going:

```
  [ 3/20] chrome@120 × main (e7f8a9b) #1                    4210ms  exit:0
  [ 4/20] chrome@120 × feature/virtual-list (3c1d44f) #1        ✗  exit:1
  [ 5/20] chrome@122 × main (e7f8a9b) #0                    4102ms  exit:0

Done. 20 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

Failed runs are recorded with the same metadata shape — just a non-zero `exitCode`. stderr is captured for diagnosis:

```
$ cat .chrome-ranger/output/f7g8h9.stderr
Error: Timed out waiting for selector "tr:nth-child(1000)"
    at bench.spec.ts:5:15
```

Status shows the gaps:

```
                        main (e7f8a9b)   feature/virtual-list (3c1d44f)
Chrome 120.0.6099.109  5/5 ✓             4/5 ✗ (1 failed)
Chrome 122.0.6261.94   4/5 ✗ (1 failed)  5/5 ✓
```

### Resuming

Running `chrome-ranger run` again only retries failed iterations for unchanged refs:

```
$ chrome-ranger run

Skipping 18 completed iterations.
Running 2 remaining iterations (2 workers)

  [ 1/2] chrome@120 × feature/virtual-list (3c1d44f) #1     2344ms  exit:0
  [ 2/2] chrome@122 × main (e7f8a9b) #1                    4198ms  exit:0

Done. 2 runs logged to .chrome-ranger/runs.jsonl
```

## CLI Commands

```
chrome-ranger init                                        # scaffold config
chrome-ranger run [--chrome <v>] [--refs <ref>]           # fill cells to minimum
                  [--append N]                             # add N more runs to targeted cells
                  [--replace]                              # clear targeted cells, then run
chrome-ranger status                                      # matrix completion table
chrome-ranger list-chrome [--latest N] [--since DATE]     # query Chrome for Testing API
chrome-ranger cache clean                                 # remove cached Chrome binaries
```

## Storage

```
.chrome-ranger/
  runs.jsonl              # one JSON line per run, append-only
  output/
    {id}.stdout           # raw stdout per run
    {id}.stderr           # raw stderr per run
  worktrees/
    {ref}/                # git worktrees, managed by CLI

~/.cache/chrome-ranger/   # shared Chrome binaries (respects XDG_CACHE_HOME)
  chrome-120.0.6099.109/
  chrome-122.0.6261.94/
```

## Analysis

chrome-ranger stops at data collection. Analysis is yours:

```bash
# quick look
cat .chrome-ranger/output/*.stdout | jq -s 'group_by(.metric) | ...'

# or pull runs.jsonl into a notebook, join with stdout, make charts
```

## What chrome-ranger Does NOT Do

- Parse or interpret script output
- Compute statistics
- Generate reports or charts
- Have opinions about metric shapes

The runs file and output directory are the interface boundary.
