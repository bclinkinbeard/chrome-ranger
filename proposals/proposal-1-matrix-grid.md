# Proposal 1: Live Matrix Grid

## Design philosophy

Everything visible at once, always. The terminal is treated as a fixed-size canvas: a progress header, a matrix grid, and a worker ticker occupy a known number of lines that are redrawn in place on every event. There is no scrolling region, no log history, no hidden state. At any moment, the entire run status is on screen -- you never need to scroll, and you never miss a state change because it scrolled past.

The tradeoff is explicit: you sacrifice per-iteration detail during the run in exchange for a display that fits in 8-12 terminal lines, redraws with trivial ANSI mechanics, and gives you the full matrix shape at a glance. Detailed per-iteration information is available after the run via `status --failures` and `status --json`.

---

## Color conventions

All color is additive. The display is fully legible without color support.

| Role | ANSI code | Usage |
|---|---|---|
| Green | `\x1b[32m` | Completed counts, `ok` suffix, filled progress segments |
| Red | `\x1b[31m` | `FAIL` suffix, failure counts, `\u2717` in dot sequences |
| Yellow | `\x1b[33m` | Braille spinner on active cells |
| Dim | `\x1b[2m` | Not-started cells (`0/N`), separator line |
| Bold | `\x1b[1m` | Progress header line |
| Reset | `\x1b[0m` | After every colored span |

No background colors are used. Safe on both dark and light terminal themes.

---

## Live run display

### Layout structure

```
Line 1:    Progress header (tool name, fraction, percentage, bar, elapsed, failures)
Line 2:    Blank
Line 3:    Column headers (ref names)
Lines 4-N: Matrix rows (one per Chrome version)
Line N+1:  Blank
Line N+2:  Worker ticker
```

Total height for a 3x3 matrix with 4 workers: **8 lines**.
Total height for a 6x4 matrix with 6 workers: **12 lines**.

### Progress header

Format:

```
chrome-ranger run  {done}/{total}  {pct}%  {bar}  {elapsed}
```

With failures:

```
chrome-ranger run  {done}/{total}  {pct}%  {bar}  {elapsed}  {N} failed
```

The bar is 30 characters wide (fixed). Filled segments use U+25B0 (`\u25b0`, `▰`), empty segments use U+25B1 (`\u25b1`, `▱`). The `{N} failed` text is red and appears only when failures exist. On completion, `{elapsed}` changes to `done in {duration}`.

### Cell format

Each matrix cell shows a fraction and a status suffix:

```
3/5         In progress, no failures yet
5/5 ok      Complete, all passed
4/5 FAIL    Has at least one failure (complete or in progress)
3/5 \u28be       Worker currently active in this cell (spinner)
0/5         Not started (rendered dim)
```

The braille spinner cycles through eight frames: `\u28be \u28bd \u28bb \u2a3f \u283f \u29df \u29ef \u28f7` (U+28BE, U+28BD, U+28BB, U+28BF, U+287F, U+29DF, U+29EF, U+28F7). It is rendered in yellow. If two workers target the same cell simultaneously (different iterations), only one spinner is shown; the ticker line disambiguates.

**Why `ok`/`FAIL` instead of checkmarks and crosses:** The ASCII words `ok` and `FAIL` are unambiguous on every terminal and monospaced font. `FAIL` at 4 characters is wider than a single glyph but earns its width by being unmissable during a matrix scan. There is zero dependence on whether the font has Unicode symbol glyphs at the correct width.

**Completed cells in large matrices:** When a cell is complete with all passes, the denominator is dropped: `10 ok` instead of `10/10 ok`. This saves 3 characters per cell. In-progress and failed cells always show the full fraction.

### Column headers

Ref names appear above the matrix columns:

```
                 main          v4.5.0         feat/virtual-list
```

Headers are truncated to fit available width using this strategy:

1. Use the full name if it fits
2. Strip common prefixes: `feature/` -> `virtual-list`, `bugfix/` -> `fix-name`
3. Abbreviate segments: `virtual-list` -> `virt-list`
4. Use initials: `feature/virtual-list` -> `fvl`

The truncation threshold is computed from `process.stderr.columns`. Full ref names always appear in the completion summary, `--failures` view, and `--json` output.

### Row labels

Each row is labeled with the Chrome major version:

```
chrome@120      ...
chrome@121      ...
chrome@122      ...
```

### Worker ticker

A single line at the bottom, prefixed with U+25B8 (`\u25b8`, `▸`). Format: `wN {chrome_major}\u00d7{ref} #{iter} ({elapsed}s)`. Idle workers are omitted.

```
  \u25b8 w1 120\u00d7v4.5.0 #2 (3.1s)  w2 121\u00d7main #2 (1.8s)
```

When workers overflow the terminal width, truncate with `+N`:

```
  \u25b8 w1 118\u00d7v5.0b1 #8 (2.1s)  w2 120\u00d7fvl #4 (3.8s)  w3 121\u00d7main #3 (1.2s)  +3
```

Elapsed time per worker ticks up live. This is essential for identifying stuck workers.

---

## Live display states: 3x3 matrix

Config: 3 Chrome versions, 3 refs, 5 iterations, 1 warmup, 4 workers.
Matrix: 9 cells, 45 total iterations, 9 warmup iterations.

### Warmup phase

```
chrome-ranger run  warmup 5/9  \u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1  0:18

                 main          v4.5.0         feat/virtual-list
chrome@120      0/5            0/5            0/5
chrome@121      0/5            0/5            0/5
chrome@122      0/5            0/5            0/5

  \u25b8 w1 120\u00d7main warmup (2.4s)  w2 121\u00d7v4.5.0 warmup (1.1s)  w3 122\u00d7main warmup (3.6s)  w4 120\u00d7fvl warmup (0.8s)
```

During warmup, the progress header shows `warmup {done}/{total}` instead of a fraction of real iterations. All matrix cells remain at `0/N` because warmup results are discarded. The ticker shows `warmup` instead of an iteration number. The progress bar tracks warmup completion (fills to 100% when all warmups are done, then resets for real iterations).

### Early run (6/45 done)

```
chrome-ranger run  6/45  13%  \u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1  0:38

                 main          v4.5.0         feat/virtual-list
chrome@120      2/5            2/5 \u28be          0/5
chrome@121      2/5 \u28be         0/5             0/5
chrome@122      0/5            0/5             0/5

  \u25b8 w1 120\u00d7v4.5.0 #2 (3.1s)  w2 121\u00d7main #2 (1.8s)
```

Height: 8 lines. Width: ~78 columns. Two workers active (w3/w4 idle, omitted). Spinners on `chrome@120 x v4.5.0` and `chrome@121 x main` match the two active workers in the ticker. Not-started cells (`0/5`) are rendered dim.

### Mid-run with 1 failure (28/45 done)

```
chrome-ranger run  28/45  62%  \u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1  2:04  1 failed

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         4/5 FAIL
chrome@121      5/5 ok         3/5 \u28be          1/5 \u28be
chrome@122      4/5 \u28be         0/5             1/5 \u28be

  \u25b8 w1 121\u00d7v4.5.0 #3 (2.4s)  w2 121\u00d7fvl #1 (4.1s)  w3 122\u00d7main #4 (0.6s)  w4 122\u00d7fvl #1 (3.2s)
```

Height: 8 lines. Width: ~92 columns. The cell `chrome@120 x feat/virtual-list` shows `4/5 FAIL` in red -- 4 iterations completed successfully, 1 failed. The header shows `1 failed` as a running counter. All four workers are active. Worker w2 at 4.1s is visibly the longest-running, making it easy to spot potential hangs.

### Complete with 2 failures (45/45)

```
chrome-ranger run  45/45  100%  \u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0  done in 3m 22s

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         4/5 FAIL
chrome@121      5/5 ok         5/5 ok         5/5 ok
chrome@122      5/5 ok         5/5 ok         4/5 FAIL

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
Failures in: chrome@120 x feature/virtual-list, chrome@122 x feature/virtual-list
Run `chrome-ranger status --failures` for details.
```

Height: 10 lines. The ticker is gone. In its place: a log-file confirmation line, a failure summary listing the affected cells with **full untruncated ref names**, and a suggested next command. The progress header changes from elapsed time to `done in 3m 22s`.

### Complete, all pass (45/45)

```
chrome-ranger run  45/45  100%  \u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0  done in 3m 04s

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         5/5 ok
chrome@121      5/5 ok         5/5 ok         5/5 ok
chrome@122      5/5 ok         5/5 ok         5/5 ok

45 runs logged to .chrome-ranger/runs.jsonl
```

Height: 8 lines. Clean. No failure lines, no suggested commands. The grid is a wall of green `ok`.

---

## Live display state: 6x4 large matrix

Config: 6 Chrome versions, 4 refs, 10 iterations, 1 warmup, 6 workers.
Matrix: 24 cells, 240 total iterations, 24 warmup iterations.

### Mid-run (80/240 done, 3 failures)

```
chrome-ranger run  80/240  33%  \u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1  4:38  3 failed

                 main          v4.5.0         v5.0-beta.1    fvl
chrome@118      10 ok          10 ok          8/10 \u28be        0/10
chrome@119      10 ok          10 ok          4/10           0/10
chrome@120      10 ok          6/10 \u28be        0/10           0/10
chrome@121      7/10 \u28be        2/10 \u28be         0/10           0/10
chrome@122      3/10 \u28be        0/10           0/10           0/10
chrome@123      0/10           0/10           0/10           0/10

  \u25b8 w1 118\u00d7v5.0b1 #8 (2.1s)  w2 120\u00d7v4.5.0 #6 (3.8s)  w3 121\u00d7main #7 (1.2s)  +3
```

Height: 12 lines. Width: ~88 columns.

Key scaling decisions:
- Complete cells show `10 ok` (denominator dropped, saving 3 chars each)
- Column headers shortened: `v5.0.0-beta.1` -> `v5.0-beta.1`, `feature/virtual-list` -> `fvl`
- Ticker truncates to 3 visible workers + `+3`; spinners in the grid show which cells the hidden workers occupy
- `0/10` cells are rendered dim
- The `3 failed` counter in the header gives instant damage assessment without scanning the grid

At 120+ columns, there is room to show the denominator on complete cells and use longer ref names:

```
                 main          v4.5.0         v5.0-beta.1     virtual-list
chrome@118      10/10 ok       10/10 ok       8/10 \u28be         0/10
```

---

## `status` command

The `status` command shows a static matrix grid read from `runs.jsonl`. Output goes to **stderr** (consistent with all non-JSON CLI output).

### Empty (no runs)

```
$ chrome-ranger status

                 main          v4.5.0         feat/virtual-list
chrome@120      0/5            0/5            0/5
chrome@121      0/5            0/5            0/5
chrome@122      0/5            0/5            0/5

No runs recorded.
```

### Partial (mid-run or after interruption)

```
$ chrome-ranger status

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         2/5
chrome@121      5/5 ok         3/5            0/5
chrome@122      4/5            0/5            0/5

29/45 complete (0 failed)
```

### Complete with failures

```
$ chrome-ranger status

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         4/5 FAIL
chrome@121      5/5 ok         5/5 ok         5/5 ok
chrome@122      5/5 ok         5/5 ok         4/5 FAIL

45/45 complete (2 failed in 2 cells)
Failures in: chrome@120 x feature/virtual-list, chrome@122 x feature/virtual-list
```

### After `--append 3`

```
$ chrome-ranger status

                 main          v4.5.0         feat/virtual-list
chrome@120      8/8 ok         8/8 ok         7/8 FAIL
chrome@121      8/8 ok         8/8 ok         8/8 ok
chrome@122      8/8 ok         8/8 ok         7/8 FAIL

72/72 complete (2 failed in 2 cells)
```

The target per cell has increased from 5 to 8. The denominator reflects the new target (original 5 + appended 3). Previously completed cells now show their accumulated count against the new target.

---

## `status --failures`

Static, pipe-friendly output for investigating failures after a run. Groups by cell. Shows per-iteration dot sequences, stderr excerpts, and an actionable retry command.

The dot sequence (`\u25cf\u25cf\u25cf\u2717\u25cf`) uses U+25CF BLACK CIRCLE for passes and U+2717 BALLOT X for failures. Passes are green, failures are red. This notation appears only in the `--failures` view (not the live display) because per-iteration granularity matters when investigating, not when monitoring.

### No failures

```
$ chrome-ranger status --failures

No failures. All 45 iterations passed.
```

### 2 failures in 2 cells

```
$ chrome-ranger status --failures

2 failures in 2 cells

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)    1 of 5 failed
  \u25cf\u25cf\u25cf\u2717\u25cf  4/5 passed, 1 failed
  run f7g8h9i0  iteration #3  exit:1  2891ms
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

  output: .chrome-ranger/output/f7g8h9i0.stderr

Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d)     1 of 5 failed
  \u25cf\u25cf\u2717\u25cf\u25cf  4/5 passed, 1 failed
  run e6f7g8h9  iteration #2  exit:1  2891ms
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

  output: .chrome-ranger/output/e6f7g8h9.stderr

Pattern: all failures on ref feature/virtual-list

Retry: chrome-ranger run --refs feature/virtual-list
```

Design details:
- **Full Chrome version, full ref name, full SHA** -- no truncation in this view
- **Dot sequence** shows exactly which iteration failed (spatial information that "iteration #3" alone does not convey)
- **Stderr** shows the first 5 lines by default; configurable with `--lines N`
- **Output file path** printed so the user can `cat` it for full context
- **Pattern line** synthesizes commonalities: "all failures on ref X", "all failures on chrome@Y", "same error across all cells". Answers "one bug or many?" in one line
- **Retry command** is copy-pasteable

### 5 failures across 3 cells (large matrix)

```
$ chrome-ranger status --failures

5 failures in 3 cells

Chrome 118.0.5993.70 x feature/virtual-list (a1b2c3d)      2 of 10 failed
  \u25cf\u25cf\u25cf\u25cf\u25cf\u25cf\u2717\u25cf\u25cf\u2717  8/10 passed, 2 failed
  run a1b2c3d4  iteration #6   exit:1  2891ms
  run d4e5f6a7  iteration #9   exit:1  3102ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)     2 of 10 failed
  \u25cf\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf\u2717\u25cf\u2717  8/10 passed, 2 failed
  run g7h8i9j0  iteration #7   exit:1  2710ms
  run k1l2m3n4  iteration #9   exit:1  2891ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 123.0.6312.58 x v5.0.0-beta.1 (f9a0b1c)            1 of 10 failed
  \u25cf\u25cf\u25cf\u25cf\u2717\u25cf\u25cf\u25cf\u25cf\u25cf  9/10 passed, 1 failed
  run o5p6q7r8  iteration #4   exit:2  1823ms
  stderr:
    ENOENT: no such file or directory, open '/tmp/bench-result.json'
        at Object.openSync (node:fs:603:3)

  output: .chrome-ranger/output/o5p6q7r8.stderr

Pattern: 4 of 5 failures on ref feature/virtual-list (same error)

Retry all: chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
```

When multiple failures in a cell share identical stderr, the content is shown once with `stderr (both identical):`. This deduplication avoids noise -- benchmark tests tend to fail the same way repeatedly.

### Verbose mode

`chrome-ranger status --failures --verbose` shows the full stderr for every failed iteration (no truncation, no deduplication), plus timestamps:

```
  run f7g8h9i0  iteration #3  exit:1  2891ms  2026-02-18T10:33:09Z
  stderr:
    Running 1 test using 1 worker
    tests/bench.spec.ts:3:5 - render 1000 rows
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
    1 failed
    1 test total
```

---

## `status --json`

Output goes to **stdout**. All other CLI output goes to stderr. This is what enables `chrome-ranger status --json | jq ...` to work without interference.

### Schema

The schema uses a flat two-level structure: cell summaries in `cells[]`, individual runs in a separate `runs[]` array. The flat `runs` array is directly convertible to a DataFrame or CSV without flattening nested structures.

Pre-computed stats per cell (`min`, `max`, `mean`, `median`) are computed over **passing runs only** (failed runs are excluded since their durations are not meaningful benchmark data).

```json
{
  "version": 1,
  "config": {
    "iterations": 5,
    "warmup": 1,
    "workers": 4,
    "command": "npx playwright test tests/bench.spec.ts"
  },
  "matrix": {
    "chrome": ["120.0.6099.109", "121.0.6167.85", "122.0.6261.94"],
    "refs": [
      {"name": "main", "sha": "e7f8a9b"},
      {"name": "v4.5.0", "sha": "c3d4e5f"},
      {"name": "feature/virtual-list", "sha": "a1b2c3d"}
    ]
  },
  "summary": {
    "totalRuns": 45,
    "passed": 43,
    "failed": 2,
    "cellsTotal": 9,
    "cellsComplete": 7,
    "cellsWithFailures": 2,
    "wallTimeMs": 202000,
    "firstRun": "2026-02-18T10:30:00.000Z",
    "lastRun": "2026-02-18T10:33:22.000Z"
  },
  "cells": [
    {
      "chrome": "120.0.6099.109",
      "ref": "main",
      "sha": "e7f8a9b",
      "target": 5,
      "passed": 5,
      "failed": 0,
      "complete": true,
      "stats": {
        "minMs": 3688,
        "maxMs": 4523,
        "meanMs": 4067,
        "medianMs": 4102
      }
    },
    {
      "chrome": "120.0.6099.109",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "target": 5,
      "passed": 4,
      "failed": 1,
      "complete": false,
      "stats": {
        "minMs": 2098,
        "maxMs": 2455,
        "meanMs": 2249,
        "medianMs": 2245
      }
    }
  ],
  "runs": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "chrome": "120.0.6099.109",
      "ref": "main",
      "sha": "e7f8a9b",
      "iteration": 0,
      "exitCode": 0,
      "durationMs": 4523,
      "timestamp": "2026-02-18T10:30:00.000Z"
    },
    {
      "id": "f7g8h9i0-j1k2-3456-lmno-pqrstuvwxyz0",
      "chrome": "120.0.6099.109",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "iteration": 3,
      "exitCode": 1,
      "durationMs": 2891,
      "timestamp": "2026-02-18T10:31:15.000Z"
    }
  ]
}
```

The `runs` array is truncated above for readability. In practice it contains all 45 (or 240) entries. Each run is denormalized with `chrome`, `ref`, `sha` fields so the array is directly usable as a flat table without joins.

The `stats` object is omitted for cells with zero successful runs.

### Variants

**Compact:** `chrome-ranger status --json --compact` omits the `runs` array entirely, returning only `config`, `matrix`, `summary`, and `cells`:

```bash
chrome-ranger status --json --compact | jq '.summary.failed'
```

**Failures filter:** `chrome-ranger status --json --failures` includes only cells with `failed > 0` in the `cells` array and only failed runs in the `runs` array. The `summary` still reflects the full matrix.

### Typical usage

```bash
# CI gate: fail if any failures exist
chrome-ranger status --json --compact | jq -e '.summary.failed == 0'

# Median duration per cell
chrome-ranger status --json --compact | jq '.cells[] | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'

# Feed all runs to pandas
chrome-ranger status --json | python3 -c "
  import json, sys, pandas as pd
  data = json.load(sys.stdin)
  df = pd.DataFrame(data['runs'])
  print(df.groupby(['chrome', 'ref'])['durationMs'].describe())
"

# Get all failed run IDs
chrome-ranger status --json | jq '[.runs[] | select(.exitCode != 0) | .id]'

# Export to CSV
chrome-ranger status --json | jq -r '.runs[] | [.chrome, .ref, .iteration, .durationMs, .exitCode] | @csv'
```

---

## Non-TTY fallback

When `!process.stderr.isTTY` (piped output, CI environments, redirected stderr), no ANSI codes are emitted. Output is a sequential log of completed iterations, one line each:

```
[  1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
[  2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
[  3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
...
[21/45] chrome@120 x feat/virtual-list (a1b2c3d) #2     2455ms  exit:1  FAIL
...
[45/45] chrome@122 x v4.5.0 (c3d4e5f) #4               3802ms  exit:0

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

Each line is self-contained: sequence number, cell identifier (chrome x ref with SHA), iteration number, duration, and exit code. Failed lines append `FAIL`. This format is CI-friendly, grep-friendly, and machine-parseable.

---

## Terminal sizing

Checked once at startup and on `SIGWINCH` (terminal resize signal).

### Row thresholds

| Terminal rows | Behavior |
|---|---|
| >= 15 | Full display: header + matrix + ticker |
| 10-14 | Drop the ticker line. Workers are still visible via spinners in the grid |
| 5-9 | Drop the matrix. Show only the progress header and the ticker (overall progress + what workers are doing) |
| < 5 | Fall back to non-TTY sequential log |

### Column thresholds

| Terminal columns | Behavior |
|---|---|
| >= 100 | Full ref names, 30-char progress bar |
| 80-99 | Abbreviated ref names, 30-char progress bar |
| 60-79 | Aggressive abbreviation, 15-char progress bar |
| < 60 | Fall back to non-TTY sequential log |

Column widths are computed as:

```
row_label_width = max(chrome_labels) + 2     // e.g., "chrome@123  " = 14
col_width = (available - row_label_width) / num_refs
```

If `col_width < 8`, the matrix cannot render meaningfully; fall back to non-TTY mode.

---

## Implementation notes

### ANSI rendering mechanics

The display redraws in place using cursor-home positioning. No scroll regions are needed.

On each tick (~100ms interval) or iteration completion event:

1. Move cursor to home: `\x1b[H`
2. Write the full display (header + blank + column headers + matrix rows + blank + ticker)
3. Clear from cursor to end of screen: `\x1b[J`

Step 3 handles terminal resizes and state transitions (e.g., the ticker disappearing on completion) without leaving stale content.

This is the simplest possible ANSI strategy. There are no scroll regions to manage, no partial redraws to coordinate, and no terminal state to clean up on exit beyond a final `\x1b[J`.

### Redraw triggers

- **Iteration completion:** Immediate redraw (the fraction changed)
- **100ms timer:** Redraws for spinner animation and worker elapsed times
- **SIGWINCH:** Recompute column widths and ref abbreviations, then redraw

The 100ms timer drives the spinner animation (8 frames = one full rotation per 800ms) and updates worker elapsed times. It does not fire when no workers are active (i.e., after completion).

### Completion transition

When all iterations finish:

1. Final redraw with all cells showing `ok`/`FAIL`, no spinners
2. Ticker line is replaced by summary lines (log path, failure list, suggested command)
3. Clear to end of screen (`\x1b[J`)
4. Cursor is left after the last line of output
5. The terminal is in a clean state -- no scroll regions to reset, no alternate screen to exit

### Signal handling

On SIGINT/SIGTERM:
1. Kill all in-flight child processes immediately
2. Move cursor to home (`\x1b[H`), clear screen (`\x1b[J`)
3. Print a one-line summary: `Interrupted. {N}/{total} completed, {M} in flight (discarded).`
4. Release the lockfile

### Output streams

- All live display output goes to **stderr** (`process.stderr.write`)
- `status --json` goes to **stdout** (`process.stdout.write`)
- This enables `chrome-ranger run 2>run.log` to capture the display while keeping stdout clean, and `chrome-ranger status --json | jq` to work without interference

### Performance

The full display for a 6x4 matrix is ~12 lines of text, roughly 1-2 KB per redraw. At 10 redraws/second, this is ~20 KB/s of stderr writes -- negligible. The redraw is a single `process.stderr.write()` call with a pre-built string buffer to avoid multiple write syscalls.

The braille spinner array is pre-allocated. Column widths and ref abbreviations are cached and recomputed only on SIGWINCH.

---

## Tradeoffs

### What you gain

- **Minimal terminal footprint.** 8 lines for a 3x3 matrix, 12 lines for a 6x4 matrix. The display never grows beyond the matrix size. This leaves the rest of the terminal for other work in a split-pane setup.
- **Trivial ANSI mechanics.** Cursor-home + full repaint + clear-to-end. No scroll regions, no alternate screen buffer, no partial updates. The implementation is ~50 lines of rendering code.
- **Zero terminal state risk.** If the process crashes, dies, or is killed with SIGKILL, the terminal is left in a normal state. There are no scroll regions to leak.
- **Instant full-matrix scan.** Every cell is always visible. You can assess the shape of the run (which cells are done, where failures are, what is still pending) in a single glance without scrolling.
- **Predictable height.** The display height is determined by the matrix dimensions and is constant throughout the run. It never jumps or resizes due to log output.

### What you give up

- **No per-iteration history during the run.** You cannot see individual iteration results (durations, exit codes) as they complete. The live display shows only aggregate counts. To see per-iteration detail, you must wait for the run to finish and use `status --failures` or inspect `runs.jsonl`.
- **No scrollback.** When the run finishes, the final state replaces the live display. There is no scrollable history of what happened during the run. The non-TTY fallback provides this, but only if you redirect stderr.
- **Spinner ambiguity with multiple workers per cell.** If two workers target the same cell (different iterations), only one spinner is shown. The ticker disambiguates, but you must look in two places.
- **Width pressure at scale.** A 6x4 matrix needs ~88 columns at minimum. Wider matrices (8+ refs) or long ref names may force aggressive abbreviation or fall back to non-TTY mode.
