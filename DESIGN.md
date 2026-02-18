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

1. Parse config, load `runs.jsonl`
2. Compute full matrix: `chrome.versions × code.refs × [0..iterations)`
3. Subtract completed runs → pending list
4. For each code ref: resolve SHA, create/reuse git worktree
5. For each Chrome version: ensure binary is downloaded and cached
6. For each worktree that will be used: run `setup` command if configured (once per worktree, skip if already set up for this SHA)
7. Dispatch pending runs across `workers` parallel workers:
   - Each worker picks the next pending run from the queue
   - Spawns `command` via shell with env vars set
   - Captures stdout/stderr to `.chrome-ranger/output/{id}.*`
   - Appends metadata line to `runs.jsonl` (serialized — one writer)
   - Prints progress: `[3/45] chrome@121 × main (e7f8a9b) #2`
8. `--append N` skips the diff, just adds N runs to the specified cells
9. `--replace` deletes existing runs for the targeted cells before running

### Parallelism

Workers run iterations concurrently up to the configured `workers` count. Each worker receives the full environment contract. The `runs.jsonl` append is serialized to avoid interleaving. Setup commands are run before dispatching any iterations and are not parallelized — each worktree is set up exactly once.

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

## What the CLI Does NOT Do

- Parse or interpret script output
- Compute statistics
- Generate reports or charts
- Have opinions about metric shapes

Analysis is the user's responsibility. The runs file and output directory are the interface boundary.
