# chrome-ranger Design

A CLI orchestrator that runs arbitrary scripts against a matrix of Chrome versions × git refs. It manages Chrome downloads, git worktrees, execution tracking, and raw output storage. It has no opinions about what the script measures or how results are analyzed.

## Config: `chrome-ranger.yaml`

```yaml
command: npx playwright test
setup: npm ci                   # runs once per worktree, before first iteration
iterations: 5
warmup: 1
workers: 4                      # parallel executions (default: 1)

chrome:
  versions:
    - "120.0.6099.109"
    - "121.0.6167.85"
    - "122.0.6261.94"

code:
  repo: .
  refs:
    - main
    - v4.5.0
    - v5.0.0-beta.1
```

## Environment Contract

The script receives these env vars and does whatever it wants with them:

| Variable | Description |
|---|---|
| `CHROME_BIN` | Absolute path to Chrome binary |
| `CHROME_VERSION` | Version string |
| `CODE_REF` | Git ref name as specified in config |
| `CODE_SHA` | Resolved commit SHA |
| `CODE_DIR` | Path to git worktree for this ref |
| `ITERATION` | Current iteration number (0-indexed) |

The script's stdout and stderr are captured verbatim. The CLI does not parse or interpret them.

## Storage Layout

```
.chrome-ranger/
  lock                     # lockfile, prevents concurrent runs
  runs.jsonl              # one JSON metadata line per run, append-only
  output/
    {id}.stdout            # raw stdout per run
    {id}.stderr            # raw stderr per run
  worktrees/
    {ref}/                 # git worktrees, managed by CLI

~/.cache/chrome-ranger/    # system-level, shared across projects
  chrome-120.0.6099.109/   # respects XDG_CACHE_HOME
  chrome-121.0.6167.85/
```

## Run Metadata (`runs.jsonl`)

One JSON line per iteration, append-only:

```json
{"id":"a1b2c3","chrome":"120.0.6099.109","ref":"main","sha":"e7f8a9b","iteration":0,"timestamp":"2026-02-18T10:30:00Z","durationMs":4523,"exitCode":0}
{"id":"d4e5f6","chrome":"120.0.6099.109","ref":"main","sha":"e7f8a9b","iteration":1,"timestamp":"2026-02-18T10:31:02Z","durationMs":4210,"exitCode":0}
```

## Data Model

```typescript
interface Config {
  command: string;            // shell command to run each iteration
  setup?: string;             // shell command run once per worktree before first iteration
  iterations: number;         // minimum runs per matrix cell
  warmup: number;
  workers: number;            // parallel executions (default: 1)
  chrome: {
    versions: string[];
    cache_dir?: string;       // default: ~/.cache/chrome-ranger
  };
  code: {
    repo: string;
    refs: string[];
  };
}

interface RunMeta {
  id: string;               // unique per run
  chrome: string;            // Chrome version
  ref: string;               // git ref as specified in config
  sha: string;               // resolved commit SHA
  iteration: number;
  timestamp: string;         // ISO 8601
  durationMs: number;        // wall clock
  exitCode: number;
}

// stdout at .chrome-ranger/output/{id}.stdout
// stderr at .chrome-ranger/output/{id}.stderr
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

## Run Behavior

1. Acquire lockfile (`.chrome-ranger/lock`). If already locked, fail immediately with an error — concurrent runs against the same project are not supported.
2. Parse config, load `runs.jsonl`
3. Compute full matrix: `chrome.versions × code.refs × [0..iterations)`
4. Subtract completed runs → pending list. A cell is "complete" only when it has a run with `exitCode: 0`. Failed runs (non-zero exit) stay in `runs.jsonl` as history but don't count toward completion.
5. For each code ref: resolve SHA, create/reuse git worktree
6. For each Chrome version: ensure binary is downloaded and cached (via `@puppeteer/browsers`)
7. For each worktree that will be used: run `setup` command if configured (once per worktree, skip if already set up for this SHA). `setup` runs with `cwd` set to the worktree directory. If setup fails for a ref, log the error and skip all iterations for that ref — other refs continue.
8. For each (chrome, ref) cell: run warmup iterations. Warmup output is completely discarded (not written to `runs.jsonl` or the output directory). If a warmup iteration fails (non-zero exit), skip all remaining iterations for that cell and log a warning.
9. Dispatch pending runs across `workers` parallel workers:
   - Each worker picks the next pending run from the queue
   - Spawns `command` via shell with `cwd` set to `CODE_DIR` (the worktree) and env vars set
   - Captures stdout/stderr to `.chrome-ranger/output/{id}.*`
   - Appends metadata line to `runs.jsonl` (serialized — one writer)
   - Run IDs are generated via `crypto.randomUUID()`
   - Prints progress: `[3/45] chrome@121 × main (e7f8a9b) #2`
10. `--append N` skips the diff, just adds N runs to the specified cells
11. `--replace` deletes existing runs for the targeted cells before running
12. `--chrome` and `--refs` filters scope everything: `--replace` only clears targeted cells, `--append` only adds to targeted cells
13. Release lockfile on exit.

### Parallelism

Workers run iterations concurrently up to the configured `workers` count. Each worker receives the full environment contract. The `runs.jsonl` append is serialized to avoid interleaving. Setup commands are run before dispatching any iterations and are not parallelized — each worktree is set up exactly once.

### Signal Handling

On SIGINT/SIGTERM: kill in-flight iterations immediately. Do not write partial results. `runs.jsonl` only contains entries from iterations that completed before the signal. The lockfile is released on exit.

### Concurrency

Running two `chrome-ranger run` processes against the same project is not supported. A lockfile at `.chrome-ranger/lock` prevents this — the second invocation fails immediately with a clear error message.

## `status` Output

```
               main (e7f8a9b)   v4.5.0 (c3d4e5f)
Chrome 120    5/5 ✓             5/5 ✓
Chrome 121    8/5 ✓             3/5 ...
Chrome 122    0/5               0/5
```

## Tech Stack

- TypeScript / Node.js
- **commander** — CLI parsing
- **js-yaml** — config
- **@puppeteer/browsers** — Chrome binary download, caching, and platform detection
- **tsup** — build/bundle

## Playwright Integration

Playwright accepts a custom Chrome binary via `executablePath` in its launch options. Since chrome-ranger provides `CHROME_BIN` as an environment variable, the user's Playwright config just passes it through:

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    launchOptions: {
      executablePath: process.env.CHROME_BIN,
    },
  },
});
```

When `CHROME_BIN` is set, Playwright uses the provided binary instead of downloading its own. This is the intended integration point — chrome-ranger manages which Chrome binary to use, Playwright just consumes it.

## Example Run

This example benchmarks a React component's render performance across Chrome versions and two branches.

### Project structure

```
my-app/
├── src/
├── tests/
│   └── bench.spec.ts
├── playwright.config.ts
├── package.json
└── chrome-ranger.yaml
```

### Config

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

### Playwright config

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    launchOptions: {
      executablePath: process.env.CHROME_BIN,
    },
  },
});
```

### Test script

```typescript
// tests/bench.spec.ts
test('render 1000 rows', async ({ page }) => {
  await page.goto('http://localhost:3000');
  const start = performance.now();
  await page.click('#load-data');
  await page.waitForSelector('tr:nth-child(1000)');
  const duration = performance.now() - start;
  console.log(JSON.stringify({ metric: 'render_1000', ms: duration }));
});
```

### Successful run

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
  [ 3/20] chrome@120 × main (e7f8a9b) #1                    4210ms  exit:0
  [ 4/20] chrome@120 × feature/virtual-list (3c1d44f) #1     2455ms  exit:0
  ...
  [19/20] chrome@122 × feature/virtual-list (3c1d44f) #3     2189ms  exit:0
  [20/20] chrome@122 × feature/virtual-list (3c1d44f) #4     2210ms  exit:0

Done. 20 runs logged to .chrome-ranger/runs.jsonl
```

### Partial failures

Failures don't abort the run. Other cells in the matrix keep going.

```
  [ 1/20] chrome@120 × main (e7f8a9b) #0                    4523ms  exit:0
  [ 2/20] chrome@120 × feature/virtual-list (3c1d44f) #0     2301ms  exit:0
  [ 3/20] chrome@120 × main (e7f8a9b) #1                    4210ms  exit:0
  [ 4/20] chrome@120 × feature/virtual-list (3c1d44f) #1        ✗  exit:1
  [ 5/20] chrome@122 × main (e7f8a9b) #0                    4102ms  exit:0
  ...

Done. 20 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

Failed runs get the same metadata shape in `runs.jsonl` — just with a non-zero `exitCode`:

```json
{"id":"f7g8h9","chrome":"120.0.6099.109","ref":"feature/virtual-list","sha":"3c1d44f","iteration":1,"exitCode":1,"durationMs":3891}
```

stderr is captured in the output file for diagnosis:

```
$ cat .chrome-ranger/output/f7g8h9.stderr
Error: Timed out waiting for selector "tr:nth-child(1000)"
    at bench.spec.ts:5:15
```

`status` shows the gaps:

```
                        main (e7f8a9b)   feature/virtual-list (3c1d44f)
Chrome 120.0.6099.109  5/5 ✓             4/5 ✗ (1 failed)
Chrome 122.0.6261.94   4/5 ✗ (1 failed)  5/5 ✓
```

### Resuming after failure

Running again only fills in the gaps — it doesn't re-run successful iterations:

```
$ chrome-ranger run

Resolving refs...
  main        → e7f8a9b  (unchanged)
  feature/virtual-list → 3c1d44f  (unchanged)

Skipping 18 completed iterations.
Running 2 remaining iterations (2 workers)

  [ 1/2] chrome@120 × feature/virtual-list (3c1d44f) #1     2344ms  exit:0
  [ 2/2] chrome@122 × main (e7f8a9b) #1                    4198ms  exit:0

Done. 2 runs logged to .chrome-ranger/runs.jsonl

$ chrome-ranger status

                        main (e7f8a9b)   feature/virtual-list (3c1d44f)
Chrome 120.0.6099.109  5/5 ✓             5/5 ✓
Chrome 122.0.6261.94   5/5 ✓             5/5 ✓
```

### Analysis

chrome-ranger stops at data collection. Analysis is yours:

```bash
cat .chrome-ranger/output/*.stdout | jq -s 'group_by(.metric) | ...'
```

Or pull `runs.jsonl` into a notebook, join with stdout files, and make charts.

## What the CLI Does NOT Do

- Parse or interpret script output
- Compute statistics
- Generate reports or charts
- Have opinions about metric shapes

Analysis is the user's responsibility. The runs file and output directory are the interface boundary.
