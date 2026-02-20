# Option A Refined: Live Matrix Grid

One design. No alternates.

This is the converged live-run display for `chrome-ranger run`. It combines the
best structural ideas from the Option A variations with specific improvements
borrowed from Option D (hybrid/scrolling log) and the special views draft.

---

## Design Summary

A compact matrix grid occupies the full display. Workers are shown inline via
spinners embedded in active cells, with a single ticker line below the grid
summarizing active workers. No separate worker panel, no scrolling log, no
box drawing. The grid redraws in-place via ANSI cursor control (~100ms tick
or on completion events).

**Base variation:** A3 (Compact Grid with Integrated Worker Markers) from the
original draft, refined with borrowings listed at the end.

**Why A3 over A1 or A2:**
- A1's side panel wastes horizontal space on idle worker rows and forces a
  fixed-width right column that competes with the matrix at larger sizes.
- A2's per-iteration dots are valuable but belong in the *post-run* `--failures`
  view (where you care about which specific iteration failed), not the *live*
  display (where you care about overall progress shape).
- A3 is the shortest, narrowest, and simplest to implement. The in-grid spinners
  give you instant worker-to-cell mapping without a separate panel.

---

## Config Reference

**Standard matrix** (3x3, used in most examples):

```yaml
chrome:
  versions:
    - "120.0.6099.109"
    - "121.0.6167.85"
    - "122.0.6261.94"
code:
  refs:
    - main
    - v4.5.0
    - feature/virtual-list
iterations: 5
warmup: 1
workers: 4
```

3 Chrome versions x 3 refs = 9 cells x 5 iterations = 45 total runs + 9 warmup.

**Large matrix** (6x4, used for scaling):

```yaml
chrome:
  versions:
    - "118.0.5993.70"
    - "119.0.6045.105"
    - "120.0.6099.109"
    - "121.0.6167.85"
    - "122.0.6261.94"
    - "123.0.6312.58"
code:
  refs:
    - main
    - v4.5.0
    - v5.0.0-beta.1
    - feature/virtual-list
iterations: 10
warmup: 1
workers: 6
```

6 Chrome versions x 4 refs = 24 cells x 10 iterations = 240 total runs + 24 warmup.

---

## Color Conventions

All color is additive (the display is fully readable without it):

- **Green** (`\x1b[32m`): completed cell counts, `ok` suffix, filled progress bar
- **Red** (`\x1b[31m`): `FAIL` suffix, failure count in summary line
- **Yellow** (`\x1b[33m`): spinner on active cells (draws the eye to motion)
- **Dim** (`\x1b[2m`): `0/N` cells (not started), idle workers, separator line
- **Bold** (`\x1b[1m`): header line (progress fraction, elapsed time)
- **No background colors** — safe on both dark and light terminals.

---

## The Design

### Cell Format

Each matrix cell is a fraction plus an optional status suffix:

```
3/5         in progress, no failures
5/5 ok      complete, all passed
4/5 FAIL    complete or in progress, has failure(s)
3/5 ⣾       in progress, worker currently active in this cell
0/5         not started (rendered dim)
```

The `⣾` braille spinner cycles through `⣾⣽⣻⢿⡿⣟⣯⣷` and is rendered in yellow.
It appears on any cell that has an active worker. If two workers target the same
cell simultaneously (different iterations), only one spinner is shown — the
ticker line below disambiguates.

Completed cells use `ok` (green) or `FAIL` (red). No checkmarks or crosses —
ASCII words are unambiguous on every terminal and monospaced font.

Why `ok`/`FAIL` instead of `✓`/`✗`: Borrowed from Option D Variation 1 which
uses `ok`/`FAIL`. These are visually louder than small Unicode glyphs. `FAIL` at
4 chars is wider than `✗` but earns it by being unmissable in a matrix scan.
Terminal compatibility is also better — no reliance on the font having these
glyphs at the right width.

### Progress Header

The top line contains:
- Tool name
- Fraction and percentage
- A thin fill bar (borrowed from A2's `━` track style, but using `▰▱`)
- Elapsed wall time
- Failure count if > 0

```
chrome-ranger run  6/45  13%  ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  0:38
```

The bar is 30 characters wide (fixed). `▰` = filled, `▱` = empty. This is the
same bar from A3 but shortened from 40 to 30 characters to save width for the
failure count suffix that appears during runs with errors:

```
chrome-ranger run  28/45  62%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱  2:04  1 failed
```

The `1 failed` text is red.

### Worker Ticker

A single line at the bottom, prefixed with `▸`, listing all active workers.
Format: `wN chrome@VER x REF #ITER (TIMEs)`. Idle workers are omitted.

```
  ▸ w1 120×v4.5.0 #2 (3.1s)  w2 121×main #2 (1.8s)
```

When all workers fit on one line, show them all. When they overflow, truncate
with `+N` and rely on the grid spinners to show which cells are active:

```
  ▸ w1 118×v5.0b1 #8 (2.1s)  w2 120×fvl #4 (3.8s)  w3 121×main #3 (1.2s)  +3
```

The ticker uses a compressed format borrowed from A3: `120×v4.5.0` drops the
`chrome@` prefix. Ref names are abbreviated using the same strategy as the
column headers (see "Ref Name Truncation" below).

Elapsed time per worker (e.g., `3.1s`) ticks up live. This is borrowed from A1
which showed elapsed time in its side panel — essential for identifying stuck
workers. The original A3 had this in the ticker already but it is worth calling
out as a firm requirement, not an optional detail.

### Ref Name Truncation

Column headers and ticker entries truncate ref names to fit available width:

1. Use full name if it fits: `feature/virtual-list`
2. Strip common prefixes: `feature/` -> `virtual-list`, `bugfix/` -> `fix-name`
3. Abbreviate segments: `virtual-list` -> `virt-list`
4. Use initials: `feature/virtual-list` -> `fvl`

The truncation threshold is computed from `process.stderr.columns`. Full ref
names always appear in: the `--failures` view, the `--json` output, and the
completion summary's failure list.

---

## States

### State 1: Early Run (6/45 done)

```
chrome-ranger run  6/45  13%  ▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  0:38

                 main          v4.5.0         feat/virtual-list
chrome@120      2/5            2/5 ⣾          0/5
chrome@121      2/5 ⣾         0/5             0/5
chrome@122      0/5            0/5             0/5

  ▸ w1 120×v4.5.0 #2 (3.1s)  w2 121×main #2 (1.8s)
```

Height: 8 lines. Width: ~78 columns. Two workers active, two idle (not shown).
The spinners on `chrome@120 x v4.5.0` and `chrome@121 x main` match the two
active workers in the ticker.

### State 2: Mid-Run with Failures (28/45 done)

```
chrome-ranger run  28/45  62%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱  2:04  1 failed

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         4/5 FAIL
chrome@121      5/5 ok         3/5 ⣾          1/5 ⣾
chrome@122      4/5 ⣾         0/5             1/5 ⣾

  ▸ w1 121×v4.5.0 #3 (2.4s)  w2 121×fvl #1 (4.1s)  w3 122×main #4 (0.6s)  w4 122×fvl #1 (3.2s)
```

Height: 8 lines. Width: ~92 columns. The cell `chrome@120 x feat/virtual-list`
shows `4/5 FAIL` in red — 4 iterations passed, 1 failed. The header line shows
`1 failed` as a running failure counter.

Four workers are active. The ticker shows elapsed time for each, making it
easy to spot if w2 (at 4.1s) is taking unusually long.

### State 3: Complete (45/45, 2 failures)

```
chrome-ranger run  45/45  100%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  done in 3m 22s

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         4/5 FAIL
chrome@121      5/5 ok         5/5 ok         5/5 ok
chrome@122      5/5 ok         5/5 ok         4/5 FAIL

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
Failures in: chrome@120 x feature/virtual-list, chrome@122 x feature/virtual-list
Run `chrome-ranger status --failures` for details.
```

Height: 10 lines. The ticker is gone (no active workers). In its place:
- A log-file confirmation line.
- A failure summary listing the affected cells with **full, untruncated ref
  names** (there is room now that the ticker is gone).
- A suggested next command. This is borrowed from Option D which consistently
  ended with an actionable suggestion on completion.

The progress bar text changes from the spinner and elapsed timer to `done in
3m 22s`.

### State 4: Complete, All Pass (45/45)

```
chrome-ranger run  45/45  100%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  done in 3m 04s

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ok         5/5 ok         5/5 ok
chrome@121      5/5 ok         5/5 ok         5/5 ok
chrome@122      5/5 ok         5/5 ok         5/5 ok

45 runs logged to .chrome-ranger/runs.jsonl
```

Height: 8 lines. Clean. No failure lines, no suggested commands. The grid is
a wall of green `ok`.

### State 5: Large Matrix (6x4, 87/240 done)

```
chrome-ranger run  87/240  36%  ▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  4:12

                 main          v4.5.0         v5.0-beta.1    fvl
chrome@118      10 ok          10 ok          8/10 ⣾        0/10
chrome@119      10 ok          10 ok          6/10           0/10
chrome@120      10 ok          9/10           4/10 ⣾        0/10 ⣾
chrome@121      9/10 ⣾        3/10 ⣾         0/10           0/10
chrome@122      4/10           0/10           0/10           0/10
chrome@123      0/10           0/10           0/10           0/10

  ▸ w1 118×v5.0b1 #8 (2.1s)  w2 120×fvl #4 (3.8s)  w3 121×main #3 (1.2s)  +3
```

Height: 12 lines. Width: ~88 columns.

Key scaling decisions:
- Completed cells show `10 ok` instead of `10/10 ok` — the denominator is
  dropped when the cell is complete. This saves 3 characters per cell.
- Column headers shorten: `v5.0.0-beta.1` -> `v5.0-beta.1`, `feature/virtual-list` -> `fvl`.
- The ticker truncates to 3 visible workers + `+3`. The spinners in the grid
  tell you which cells the hidden workers are in.
- `0/10` cells are rendered dim.

At 120 columns, there is room to show the denominator on completed cells and
use slightly longer ref names:

```
                 main          v4.5.0         v5.0-beta.1     virtual-list
chrome@118      10/10 ok       10/10 ok       8/10 ⣾         0/10
```

### State 6: Large Matrix, Complete with Failures (240/240)

```
chrome-ranger run  240/240  100%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  done in 16m 08s

                 main          v4.5.0         v5.0-beta.1    fvl
chrome@118      10 ok          10 ok          10 ok          9/10 FAIL
chrome@119      10 ok          10 ok          10 ok          10 ok
chrome@120      10 ok          10 ok          10 ok          9/10 FAIL
chrome@121      10 ok          10 ok          10 ok          10 ok
chrome@122      10 ok          10 ok          10 ok          10 ok
chrome@123      10 ok          10 ok          9/10 FAIL      10 ok

240 runs logged to .chrome-ranger/runs.jsonl (5 failed across 3 cells)
Failures in:
  chrome@118 x feature/virtual-list
  chrome@120 x feature/virtual-list
  chrome@123 x v5.0.0-beta.1
Run `chrome-ranger run --refs feature/virtual-list` to retry (covers 2 of 3 cells).
```

Height: 16 lines. The failure summary uses full ref names and is broken across
multiple lines for clarity. The retry suggestion is smart: it picks the
`--refs` flag that covers the most failed cells, with a note that it covers
2 of 3 (the third cell, `chrome@123 x v5.0.0-beta.1`, needs a separate retry
or no scoping at all).

---

## Non-TTY Fallback

When `!process.stderr.isTTY`, no ANSI codes are emitted. Output is a sequential
log of completed iterations (one line each), with a final summary:

```
[  1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
[  2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
[  3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
...
[ 45/45] chrome@122 x v4.5.0 (c3d4e5f) #4               3802ms  exit:0

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

This format is borrowed from Option D's scrolling log lines. Each line is
self-contained with: sequence number, cell identifier (chrome x ref with SHA),
iteration number, duration, and exit code. Failed lines append `FAIL` in place
of `exit:0`:

```
[ 21/45] chrome@120 x feat/virtual-list (a1b2c3d) #2     2455ms  exit:1  FAIL
```

This output is CI-friendly, grep-friendly, and parseable.

---

## Small Terminal Degradation

Checked once at startup and on `SIGWINCH`:

1. **Under 30 rows:** Display normally (the grid is 8-12 lines, well within range).
2. **Under 15 rows:** Drop the ticker line. Workers are still visible via spinners
   in the grid.
3. **Under 10 rows:** Drop the matrix. Show only the progress header line and the
   ticker. This is the absolute minimum: you see overall progress and what
   workers are doing.
4. **Under 5 rows or non-TTY:** Fall back to sequential log (see above).

Column width threshold: if `columns < 80`, shorten the progress bar from 30 to
15 characters and abbreviate ref names more aggressively.

---

## `status --failures` View

This is not a live display. It is static, pipe-friendly output for investigating
failures after a run. It groups by cell (the natural mental model: "which
chrome x ref pair broke?"), shows stderr excerpts, and ends with an actionable
retry command.

The dot sequence from A2 (`●●●✗●`) appears here — not in the live display, but
in the failure report where per-iteration granularity matters. This is the
hybrid recommendation from the original A draft's comparison section: clean
fractions during the run, precise dots when investigating.

### No Failures

```
$ chrome-ranger status --failures

No failures. All 45 iterations passed.
```

### Standard Failures (2 cells, 2 iterations failed)

```
$ chrome-ranger status --failures

2 failures in 2 cells

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)    1 failure
  ●●●✗●  4/5 passed, 1 failed
  run f7g8h9i0  iteration #3  exit:1  2891ms
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

  output: .chrome-ranger/output/f7g8h9i0.stderr

Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d)     1 failure
  ●●✗●●  4/5 passed, 1 failed
  run e6f7g8h9  iteration #2  exit:1  2891ms
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

  output: .chrome-ranger/output/e6f7g8h9.stderr

Pattern: all failures on ref feature/virtual-list

Retry: chrome-ranger run --refs feature/virtual-list
```

Design notes:
- The `●●●✗●` dot sequence (from A2) shows exactly which iteration failed. The
  `✗` is red. This gives spatial information that a bare "iteration #3" does not.
- Full Chrome version, full ref name, full SHA — no truncation in this view.
- Stderr is shown (first 5 lines by default, configurable with `--lines N`).
- Each failed iteration shows: run ID, iteration number, exit code, duration.
- The output file path is printed so the user can `cat` it.
- The "Pattern" line at the bottom is borrowed from special views Variation 2B.
  It calls out the common axis when all failures share a ref (or a Chrome
  version). This answers "is this one bug or many?" in one line.
- The retry command is a copy-pasteable `chrome-ranger run` invocation.

### Many Failures (5 across 3 cells, large matrix)

```
$ chrome-ranger status --failures

5 failures in 3 cells

Chrome 118.0.5993.70 x feature/virtual-list (a1b2c3d)     2 failures
  ●●●●●●✗●●✗  8/10 passed, 2 failed
  run a1b2c3d4  iteration #6   exit:1  2891ms
  run d4e5f6a7  iteration #9   exit:1  3102ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)    2 failures
  ●●●●●●●✗●✗  8/10 passed, 2 failed
  run g7h8i9j0  iteration #7   exit:1  2710ms
  run k1l2m3n4  iteration #9   exit:1  2891ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 123.0.6312.58 x v5.0.0-beta.1 (f9a0b1c)           1 failure
  ●●●●✗●●●●●  9/10 passed, 1 failed
  run o5p6q7r8  iteration #4   exit:2  1823ms
  stderr:
    ENOENT: no such file or directory, open '/tmp/bench-result.json'
        at Object.openSync (node:fs:603:3)

  output: .chrome-ranger/output/o5p6q7r8.stderr

Pattern: 4 of 5 failures on ref feature/virtual-list (same error)

Retry all: chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
```

When multiple failures in a cell share identical stderr, the stderr is shown
once with a note: `stderr (both identical):`. This deduplication is borrowed
from special views Variation 2A. It avoids noise — benchmark tests tend to
fail the same way repeatedly.

### Verbose Mode

`chrome-ranger status --failures --verbose` shows the full stderr for every
failed iteration (no truncation, no deduplication), plus timestamps:

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

Timestamps are included in verbose mode (borrowed from special views Variation
2B) for correlation with external events. They are omitted from the default
view to reduce noise.

---

## `status --json` Schema

The JSON schema uses a flat two-level structure: cell summaries in `cells[]`,
individual runs in a separate `runs[]` array. This is the recommendation from
the special views draft (Variation 3B) — the flat `runs` array is trivially
convertible to a DataFrame or CSV without flattening nested arrays.

Pre-computed stats per cell (from special views Variation 3A) are included
because benchmark users will want median/min/max without doing the math in jq.
Stats are computed over *passing* runs only (failed runs are excluded from the
statistical summary, since their durations are not meaningful benchmark data).

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

Notes on the `runs` array: it is truncated above for readability. In practice
it contains all 45 (or 240) runs. Each run is denormalized with `chrome`, `ref`,
`sha` fields so the array is directly usable as a flat table without joins.

**Compact variant:** `chrome-ranger status --json --compact` omits the `runs`
array entirely and just returns `cells` and `summary`:

```bash
chrome-ranger status --json --compact | jq '.summary.failed'
```

**Failures filter:** `chrome-ranger status --json --failures` includes only
cells with `failed > 0` in the `cells` array, and only failed runs in the
`runs` array.

**Typical usage:**

```bash
# CI gate: fail if any failures exist
chrome-ranger status --json --compact | jq -e '.summary.failed == 0'

# Median duration per cell (for benchmark comparison)
chrome-ranger status --json --compact | jq '.cells[] | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'

# Feed all runs to pandas
chrome-ranger status --json | python3 -c "
  import json, sys, pandas as pd
  data = json.load(sys.stdin)
  df = pd.DataFrame(data['runs'])
  print(df.groupby(['chrome', 'ref'])['durationMs'].describe())
"

# Get all failed run IDs for investigation
chrome-ranger status --json | jq '[.runs[] | select(.exitCode != 0) | .id]'

# Export to CSV
chrome-ranger status --json | jq -r '.runs[] | [.chrome, .ref, .iteration, .durationMs, .exitCode] | @csv'
```

Output goes to **stdout** (not stderr). All other CLI output goes to stderr.
This is what enables piping.

---

## Implementation Notes

### ANSI Rendering

The display redraws in-place using `\x1b[H` (cursor home) followed by the full
grid. No scroll regions needed (unlike Option D which manages a pinned header
and scrolling log separately). The entire display is the grid.

On each tick (~100ms) or completion event:
1. Move cursor to home: `\x1b[H`
2. Write the full display (header + blank + column headers + matrix rows + blank + ticker)
3. Clear from cursor to end of screen: `\x1b[J`

Step 3 handles terminal resizes and state transitions (e.g., the ticker
disappearing on completion) without stale content.

### Transition on Completion

When all iterations finish:
1. Final redraw with all cells showing `ok`/`FAIL`, no spinners.
2. Ticker line is replaced by the summary lines.
3. Cursor is positioned after the last line of output.
4. The terminal is left in a clean state — no scroll regions to reset.

### Width Computation

On startup and `SIGWINCH`, compute available width from `process.stderr.columns`
(default 80 if undefined). Column widths are allocated:

```
row_label_width = max(chrome_labels) + 2    // e.g., "chrome@123  " = 14
col_width = (available - row_label_width) / num_refs
```

If `col_width < 12`, ref names are abbreviated more aggressively. If
`col_width < 8`, the display is too narrow — fall back to non-TTY mode.

### Lockfile and Signals

- SIGINT/SIGTERM: immediately kill in-flight iterations, clear the display
  (move cursor to home, clear screen), print a one-line summary of what
  completed before interruption, release the lockfile.
- The lockfile prevents concurrent `chrome-ranger run` against the same project.
  If a lockfile exists, `run` prints an error and exits.

---

## Cross-Pollination Notes

What was borrowed from other drafts, and why.

### From Option D (Hybrid draft)

1. **`ok`/`FAIL` instead of `✓`/`✗`**: Option D Variation 1 used plain ASCII
   words for cell status (`ok`, `FAIL`). These are more visible than small
   Unicode symbols, survive copy-paste into plain-text chat, and have zero
   terminal compatibility concerns. `FAIL` is 4 chars but its loudness justifies
   the width.

2. **Actionable suggestion on completion**: Option D consistently ended its
   completion state with a suggested next command (`Run \`chrome-ranger status
   --failures\` for details`). The original A3 listed failures but did not tell
   you what to do about them. The refined design now always ends with a
   suggestion when there are failures.

3. **Non-TTY fallback format**: Option D's scrolling log line format
   (`[ N/TOTAL] chrome@VER x REF (SHA) #ITER  DURATIONms  exit:CODE`) is used
   as the non-TTY fallback. It is self-contained, grep-friendly, and already
   designed for sequential output. The original A draft had no non-TTY fallback
   specified.

4. **`1 failed` counter in the progress header**: Option D Variation 1 showed
   the failure count in the progress line (`28/45  62%  2:14  1 failed`). The
   original A3 did not surface the failure count until you scanned the grid.
   Adding it to the header gives instant damage assessment.

### From Special Views draft

5. **Per-iteration dot sequence in `--failures`**: The dot notation `●●●✗●`
   from A2 was originally considered for the *live* display but rejected for
   being too wide. The special views draft showed it in the `--failures` output
   (Variation 2C's failure matrix used it, Variation 2A used a compact grouped
   format). The refined design places the dots exclusively in `--failures` where
   per-iteration granularity is the whole point.

6. **"Pattern" detection line**: Special views Variation 2B included a "Patterns"
   section at the bottom of `--failures` that synthesized commonalities
   (e.g., "all failures on ref feature/virtual-list"). This is extremely
   actionable — it answers "one bug or many?" in one line. Adopted for the
   `--failures` view.

7. **Stderr deduplication**: Special views Variation 2A deduplicated identical
   stderr across failures in the same cell (`stderr (both identical):`). This
   avoids noise when benchmark tests fail the same way repeatedly. Adopted.

8. **Flat two-level JSON schema (Variation 3B)**: The separate `cells[]` and
   `runs[]` arrays are more pandas-friendly than the nested approach where runs
   live inside cells. The denormalization cost is trivial. Adopted as the JSON
   structure.

9. **Pre-computed stats in JSON (from Variation 3A)**: The `stats` object
   (`minMs`, `maxMs`, `meanMs`, `medianMs`) per cell means most benchmark
   analysis does not require touching the `runs` array at all. Borrowed from
   the nested variant and added to the flat structure as a hybrid.

10. **`--json --compact` variant**: The original A draft proposed this as a way
    to get cell summaries without the (potentially large) `runs` array. Retained
    because it is the right thing for CI gates where you only need `summary.failed`.

### From Option A Variations (kept from own draft)

11. **A3's inline spinners**: The core insight of A3 — showing worker activity
    directly in the grid cell rather than in a separate panel — is the heart of
    this design. It keeps height minimal and creates an instant visual mapping
    between workers and cells.

12. **A2's thin progress bar style**: The `▰▱` bar from A3 (which was itself a
    slight variation on A2's `━` track) is retained. It is thinner and less
    dominant than a full `[========>...]` bar (from Option D Variation 3),
    appropriate for a secondary indicator under the fraction.

13. **A1's elapsed time per worker**: A1 showed elapsed time ticking up on each
    worker in its side panel. This is essential for identifying stuck workers
    and is carried into the ticker line.

14. **A3's `+N` overflow for the ticker**: When workers do not fit on one line,
    show a count of hidden workers and rely on the grid spinners to show their
    locations. This graceful degradation avoids the ticker growing unbounded.

### What Was Explicitly Rejected

- **Option D's scrolling log in the live display**: The scrolling log below a
  pinned header is Option D's distinguishing feature. It is valuable for
  seeing individual iteration results as they complete. But it requires scroll
  region management (`\x1b[{N};r`), adds implementation complexity, and
  doubles the cognitive load (grid above, log below). The refined Option A
  commits to grid-only. Users who want per-iteration detail can check
  `--failures` or the `runs.jsonl` file after the run.

- **Option D Variation 2's box-drawn table**: Box drawing creates strong visual
  structure but adds noise and terminal compatibility risk. The refined design
  uses no borders, no boxes, just whitespace alignment.

- **Special views Variation 2C's failure matrix**: Showing a failure-specific
  matrix grid in `--failures` (cells showing `2 FAIL` or `-`) adds visual
  context but takes up vertical space without adding much over the grouped
  listing. The dot sequence `●●●✗●` serves the same spatial purpose more
  compactly.

- **Special views Variation 1C's per-cell timing in the status grid**: Showing
  `3.7-4.5s` in each cell of the status grid is tempting for a benchmarking
  tool, but the grid is already width-constrained. Timing data belongs in
  `--json` where it can be properly analyzed. The human-readable status
  view focuses on completion and pass/fail.
