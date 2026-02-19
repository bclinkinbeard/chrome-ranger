# Option D Refined: Hybrid Matrix Header + Scrolling Log

The single best design for `chrome-ranger run` live output. This combines the pinned-header matrix from Option D with the best elements borrowed from Option A (Live Matrix Grid) and the Special Views draft. One design, shown in all states.

**Standard matrix** (from DESIGN.md):

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
    - v5.0.0-beta.1
iterations: 5
warmup: 1
workers: 4
```

3 Chrome versions x 3 refs = 9 cells x 5 iterations = 45 total runs + 9 warmup.

**Large matrix** (for scaling tests):

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

## Design Summary

The display is split into two regions:

1. **Pinned header** -- redrawn in place via ANSI cursor control. Contains the progress bar, matrix grid, and worker status. Occupies the top N lines of the terminal.
2. **Scrolling log** -- normal scrolling output below the header. Each completed iteration appends one line. The user can scroll back through these after the run.

The matrix uses one line per Chrome version. Each line contains inline progress bars for every ref, using block characters for density. Workers are displayed below the matrix, packed two per line.

### Key design decisions

- **Block-char progress bars** (`█████`, `░░░░░`) instead of bracket bars (`[====>    ]`). Block chars are denser (5 chars vs 9+2 brackets), more visually immediate, and every modern terminal renders them correctly. Borrowed from Option A1.
- **Status suffixes** instead of status words. Complete cells show `✓`, cells with failures show `✗N` (where N is the failure count). In-progress cells show the fraction `3/5`. Not-started cells show `0/5` dimmed. Borrowed from Option A1/A3.
- **Workers packed 2-per-line** below the matrix, with elapsed time ticking up. Idle workers are omitted (implicit: if not listed, idle). From D3, with A3's compactness philosophy.
- **No box drawing, no borders.** The boundary between header and log is a plain `---` line. Minimal visual noise, maximum compatibility.
- **Failure markers in the bars.** A failed iteration renders as `✗` inside the bar at its position: `███✗░` means 3 passed, 1 failed, 1 remaining. From Option A1.

### Header height formula

```
1  progress bar
1  blank
N  chrome version rows (one per version)
1  blank
W  worker rows (ceil(active_workers / 2))
1  separator (---)
```

Standard (3x3, 4 workers): 1 + 1 + 3 + 1 + 2 + 1 = **9 lines**
Large (6x4, 6 workers): 1 + 1 + 6 + 1 + 3 + 1 = **13 lines**

When all workers are active, the worker section is at maximum height. When workers finish faster than the matrix (e.g., near end of run with only 1-2 active), the worker section shrinks, and the header gets shorter.

---

## Terminal Mechanics

**Scroll region.** On startup, set the scroll region to `[header_height+1 ; terminal_rows]` via `\x1b[{top};{bottom}r`. The header is redrawn by moving the cursor to `\x1b[1;1H` and overwriting. Log lines are written below the scroll region boundary and scroll naturally.

**Redraw frequency.** The header redraws on every iteration completion event (not on a timer). For long-running iterations, a 1-second timer also redraws to update worker elapsed times. This avoids busy-looping on the header while keeping worker times visually fresh.

**Non-TTY fallback.** When `!process.stderr.isTTY`, skip the header entirely. Emit only the scrolling log lines as plain text. Detected once at startup.

**Color.** Green for passed (`\x1b[32m`), red for failures (`\x1b[31m`), yellow for active workers (`\x1b[33m`), dim (`\x1b[2m`) for not-started cells and idle state. No background colors -- works on both dark and light terminals.

**Completion transition.** When all iterations finish: redraw the header one final time (workers replaced with summary), reset the scroll region (`\x1b[r`), place the cursor after the last log line. The terminal is left clean -- the user can scroll up through the full log.

**Small terminal degradation.** Checked on startup and on `SIGWINCH`:
- Below 30 rows: hide the matrix, show only progress bar + active workers + separator.
- Below 15 rows: show only the progress bar and separator. Workers move to the log as completion lines.
- Below 10 rows: no header at all. Pure scrolling log with a progress fraction prefix on each line.

---

## The Live Display: All States

### State 1: Early Run -- 6/45 done, warmup complete

```
chrome-ranger run  6/45  13%  elapsed 0:41

 chrome@120  main ██░░░ 2/5   v4.5.0 ██░░░ 2/5   v5.0.0-b ░░░░░ 0/5
 chrome@121  main ██░░░ 2/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5
 chrome@122  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5

 w1 chrome@120 x v4.5.0 #2        3.1s    w3 (idle)
 w2 chrome@121 x main #2          1.8s    w4 (idle)
---
  [ 1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
  [ 2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
  [ 3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
  [ 4/45] chrome@121 x main (e7f8a9b) #1                  4198ms  exit:0
  [ 5/45] chrome@120 x v4.5.0 (c3d4e5f) #0                3891ms  exit:0
  [ 6/45] chrome@120 x v4.5.0 (c3d4e5f) #1                3744ms  exit:0
```

Header: 9 lines. The progress line uses the same format as Option A1. Block bars are 5 chars wide (1:1 with iterations). Not-started cells are dimmed. Idle workers shown dimmed -- they appear because the run just started and not all workers have been dispatched yet. Once all workers are busy, idle entries disappear, and the worker section can shrink.

Width: `" chrome@122  main █████ 5/5   v4.5.0 █████ 5/5   v5.0.0-b █████ 5/5"` = 74 chars. Fits comfortably at 80 columns.

### State 2: Mid-Run -- 28/45 done, 1 failure

```
chrome-ranger run  28/45  62%  elapsed 2:14                         1 failed

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ███✗░ 3/5 ✗1
 chrome@121  main █████ 5/5 ✓  v4.5.0 ███░░ 3/5    v5.0.0-b █░░░░ 1/5
 chrome@122  main ████░ 4/5    v4.5.0 ░░░░░ 0/5    v5.0.0-b █░░░░ 1/5

 w1 chrome@121 x v4.5.0 #3        2.4s    w3 chrome@122 x main #4          0.6s
 w2 chrome@121 x v5.0.0-b #1      4.1s    w4 chrome@122 x v5.0.0-b #1     3.2s
---
  [21/45] chrome@120 x v5.0.0-b (f9a0b1c) #2              2455ms  exit:1  FAIL
  [22/45] chrome@121 x main (e7f8a9b) #4                  4088ms  exit:0
  [23/45] chrome@120 x v5.0.0-b (f9a0b1c) #3              2189ms  exit:0
  [24/45] chrome@121 x v4.5.0 (c3d4e5f) #1                3291ms  exit:0
  [25/45] chrome@122 x main (e7f8a9b) #2                  4301ms  exit:0
  [26/45] chrome@121 x v4.5.0 (c3d4e5f) #2                3402ms  exit:0
  [27/45] chrome@122 x main (e7f8a9b) #3                  4102ms  exit:0
  [28/45] chrome@121 x v5.0.0-b (f9a0b1c) #0              2102ms  exit:0
```

Key details:
- `███✗░ 3/5 ✗1` -- the `✗` occupies the 4th block position, showing exactly which iteration failed. The suffix `✗1` (red) gives the count. The fraction `3/5` counts only passes.
- Completed cells: `█████ 5/5 ✓` (green). The `✓` is a strong visual signal; you can scan the matrix for non-`✓` cells to find what needs attention.
- The `1 failed` counter on the progress line is right-aligned and red. It appears only when failures exist.
- All 4 workers are active, so no idle entries. Worker section is 2 lines (4 workers / 2 per line).
- In the scrolling log, the FAIL line (iteration 21) is rendered in red with `FAIL` suffix.

### State 3: Complete -- 45/45 done, 2 failures

On completion, the header transforms: workers disappear, replaced by a summary block. The separator changes to `===` to signal finality.

```
chrome-ranger run  45/45  100%  3m 22s                              2 failed

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1
 chrome@121  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@122  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1

 Done. 45 runs in 3m 22s, 2 failed in 2 cells.
 See: chrome-ranger status --failures
===
```

Header: 8 lines (progress, blank, 3 matrix rows, blank, 2 summary lines, separator). The summary replaces the worker section, so the header is actually shorter on completion than during the run.

The scrolling log below `===` is frozen. The terminal scroll region is released so the user can scroll up through the entire history.

The completed bars show the full picture. `████✗` means 4 passed, the 5th was a failure. The `✗` is at the specific position where the failure occurred. On the final display, fractions for cells with all passes can optionally drop the denominator (e.g., `5 ✓` instead of `5/5 ✓`) but I prefer keeping `5/5 ✓` for the completion state because it is the final record and explicitness beats brevity here.

### State 4: All Passes -- 45/45, no failures

```
chrome-ranger run  45/45  100%  3m 02s

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@121  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@122  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓

 Done. 45 runs in 3m 02s, all passed.
 Logged to .chrome-ranger/runs.jsonl
===
```

Clean. No failure counter in the header, no red anywhere. The summary points to the output file for analysis.

---

## Large Matrix: 6x4, 10 iterations, 6 workers

### State: Early Run -- 18/240 done

```
chrome-ranger run  18/240   8%  elapsed 1:12

 chrome@118  main █████░░░░░ 5/10   v4.5.0 ███░░░░░░░ 3/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10
 chrome@119  main █████░░░░░ 5/10   v4.5.0 ██░░░░░░░░ 2/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10
 chrome@120  main ███░░░░░░░ 3/10   v4.5.0 ░░░░░░░░░░ 0/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10
 chrome@121  main ░░░░░░░░░░ 0/10   v4.5.0 ░░░░░░░░░░ 0/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10
 chrome@122  main ░░░░░░░░░░ 0/10   v4.5.0 ░░░░░░░░░░ 0/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10
 chrome@123  main ░░░░░░░░░░ 0/10   v4.5.0 ░░░░░░░░░░ 0/10   v5.0.0-b ░░░░░░░░░░ 0/10   feat/vl ░░░░░░░░░░ 0/10

 w1 chrome@119 x main #2        2.1s    w4 chrome@120 x main #3       0.9s
 w2 chrome@118 x v4.5.0 #3      3.8s    w5 chrome@118 x v5.0.0-b #0  4.5s
 w3 chrome@119 x v4.5.0 #2      1.4s    w6 chrome@118 x feat/vl #0   2.2s
---
  [ 15/240] chrome@120 x main (e7f8a9b) #0                 4523ms  exit:0
  [ 16/240] chrome@118 x v4.5.0 (c3d4e5f) #2               3802ms  exit:0
  [ 17/240] chrome@119 x v4.5.0 (c3d4e5f) #0               3688ms  exit:0
  [ 18/240] chrome@120 x main (e7f8a9b) #1                 4210ms  exit:0
```

Header: 13 lines. The bars are 10 chars wide (1:1 with iterations). Each matrix line is long: `" chrome@118  main ██████████ 10/10 ✓  v4.5.0 ██████████ 10/10 ✓  v5.0.0-b ██████████ 10/10 ✓  feat/vl ██████████ 10/10 ✓"` = ~115 characters at full completion. This fits 120-column terminals. At 100 columns, the bars shrink to 5 chars (1:2 mapping, each block = 2 iterations) and the fraction adjusts:

**100-column fallback (bars = 5 chars for 10 iterations):**

```
 chrome@118  main █████ 10 ✓  v4.5.0 █████ 10 ✓  v5.0.0-b █████ 10 ✓  feat/vl █████ 10 ✓
```

Width: ~92 chars. The bar is approximate (each `█` = 2 iterations), but the fraction is exact. This is the same adaptive strategy as D3's original design. The decision of which bar width to use is made once at startup based on `process.stderr.columns`.

Ref name truncation: `feature/virtual-list` becomes `feat/vl`. The truncation strategy, borrowed from Option A:
1. Strip common prefixes: `feature/`, `bugfix/`, `hotfix/`
2. If still > 10 chars: take first 4 chars of each segment, joined by `/`
3. Full ref names always appear in the scrolling log lines and in worker descriptions

### State: Mid-Run -- 142/240, 3 failures

```
chrome-ranger run  142/240  59%  elapsed 9:48                       3 failed

 chrome@118  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ████████✗░ 8/10 ✗1
 chrome@119  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ██████████ 10 ✓
 chrome@120  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ████████░░ 8/10  feat/vl █████░░░░░ 5/10
 chrome@121  main ██████████ 10 ✓  v4.5.0 ███████░░░ 7/10  v5.0.0-b ████░░░░░░ 4/10  feat/vl ██░░░░░░░░ 2/10
 chrome@122  main ███░░░░░░░ 3/10  v4.5.0 █░░░░░░░░░ 1/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10
 chrome@123  main ░░░░░░░░░░ 0/10  v4.5.0 ░░░░░░░░░░ 0/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10

 w1 chrome@121 x v5.0.0-b #4    1.2s    w4 chrome@122 x v4.5.0 #1    0.4s
 w2 chrome@122 x main #3        3.6s    w5 chrome@120 x feat/vl #7   4.1s
 w3 chrome@121 x feat/vl #6     2.8s    w6 chrome@120 x v5.0.0-b #9  1.7s
---
  [139/240] chrome@120 x v5.0.0-b (f9a0b1c) #7            2301ms  exit:0
  [140/240] chrome@118 x feat/vl (a1b2c3d) #8             2891ms  exit:1  FAIL
  [141/240] chrome@121 x v4.5.0 (c3d4e5f) #6              3402ms  exit:0
  [142/240] chrome@120 x v5.0.0-b (f9a0b1c) #8            2189ms  exit:0
```

Note: completed cells switch to `10 ✓` (drop the denominator and the `/10` when all iterations pass). This saves 3 chars per complete cell, which matters at scale. In-progress cells always show the full fraction `8/10`. This is the density trick from A1's large matrix state.

The `████████✗░` bar for chrome@118 x feat/vl shows exactly where the failure is: iteration 8 (the 9th position, zero-indexed). The `✗` is red. The suffix `✗1` counts failures.

All 6 workers are active, packed into 3 lines. Worker descriptions are truncated to fit within half the terminal width: `chrome@121 x v5.0.0-b #4` is 26 chars, leaving room for the elapsed time.

### State: Complete -- 240/240, 5 failures

```
chrome-ranger run  240/240  100%  16m 08s                           5 failed

 chrome@118  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ████████✗✗ 8/10 ✗2
 chrome@119  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ██████████ 10 ✓
 chrome@120  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ████████✗░ 9/10 ✗1
 chrome@121  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ██████████ 10 ✓
 chrome@122  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ██████████ 10 ✓  feat/vl ██████████ 10 ✓
 chrome@123  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b █████████✗ 9/10 ✗1  feat/vl ██████████ 10 ✓

 Done. 240 runs in 16m 08s, 5 failed across 3 cells.
 Retry: chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
===
```

The retry suggestion scopes to only the affected refs (borrowed from D1/D3). The bars now tell a clear story: the `feat/vl` column has two cells with `✗` markers, and `v5.0.0-b` has one cell with `✗`. All other cells are clean green `✓`.

---

## The `--failures` View

Invoked as `chrome-ranger status --failures` after a run. This is static scrolling output (not a pinned-header display). It groups failures by cell, deduplicates identical stderr, and ends with a pattern summary and retry command.

This design is a hybrid of Special Views 2A (grouped by cell) and 2B (pattern detection), with the iteration-position dot sequence from Option A2 for per-iteration visibility.

### No failures

```
$ chrome-ranger status --failures

No failures. All 45 iterations passed.
```

### Standard: 2 failures in 2 cells

```
$ chrome-ranger status --failures

2 failures in 2 cells

Chrome 120.0.6099.109 x v5.0.0-beta.1 (f9a0b1c)           1 of 5 failed
  ●●●✗●
  #3  exit:1  2455ms  run:f7g8h9i0
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/f7g8h9i0.stderr

Chrome 122.0.6261.94 x v5.0.0-beta.1 (f9a0b1c)            1 of 5 failed
  ●●✗●●
  #2  exit:1  2891ms  run:e6f7g8h9
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/e6f7g8h9.stderr

Pattern: all failures on ref v5.0.0-beta.1, same error

Retry: chrome-ranger run --refs v5.0.0-beta.1
```

### Large: 5 failures across 3 cells, multiple error types

```
$ chrome-ranger status --failures

5 failures in 3 cells

Chrome 118.0.5993.70 x feature/virtual-list (a1b2c3d)      2 of 10 failed
  ●●●●●●●●✗✗
  #8  exit:1  2891ms  run:a1b2c3d4
  #9  exit:1  3102ms  run:d4e5f6a7
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)     1 of 10 failed
  ●●●●●●●●✗●
  #8  exit:1  2710ms  run:b2c3d4e5
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 123.0.6312.58 x v5.0.0-beta.1 (f9a0b1c)            2 of 10 failed
  ●●●●✗●●●●✗
  #4  exit:2  1823ms  run:c3d4e5f6
  stderr:
    ENOENT: no such file or directory, open '/tmp/bench-result.json'
        at Object.openSync (node:fs:603:3)
  #9  exit:137  1002ms  run:e5f6a7b8
  stderr:
    Error: page.goto: net::ERR_CONNECTION_REFUSED
        at bench.spec.ts:3:9

Pattern: 3 of 5 failures on ref feature/virtual-list (same error: Timed out)

Retry all: chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
Full stderr: cat .chrome-ranger/output/<run-id>.stderr
```

### Design notes for `--failures`

- **Dot sequences** (`●●●●●●●●✗✗`) are borrowed from Option A2. Each `●` is a passed iteration, each `✗` is a failed one, in order. This gives instant visual recognition of where in the iteration sequence failures occur (early? late? clustered?). The dots are green, the `✗` markers are red.
- **Grouped by cell** (chrome x ref). This is the natural mental model for a matrix tool. You ask "which cell broke?" not "what happened at 10:38?"
- **Stderr deduplication.** When multiple failures in the same cell have identical stderr, they are collapsed: `stderr (both identical):` with the content shown once. This prevents noise in the common case where the same test fails the same way.
- **Pattern line.** At the bottom, before the retry command, a single line synthesizes commonalities. Examples: "all failures on ref X", "all failures on chrome@Y", "same error across all cells", "failures only on iteration #9+". This is the most actionable part of the output -- it answers "is this one bug or many?" Borrowed from Special Views 2B.
- **Retry command.** Scoped to only the affected refs (or chrome versions, if the pattern is version-specific). Copy-pasteable.
- **Stderr: last 3 lines** by default (configurable with `--lines N`). The last 3 lines typically contain the error message and stack trace entry point. Use `--failures --verbose` for full stderr.
- **Output file path** shown so the user can `cat` it for full context.

---

## The `--json` Schema

Invoked as `chrome-ranger status --json`. Outputs to stdout (the one exception to "all output goes to stderr"). Designed for piping to `jq`, feeding into pandas, or driving CI gates.

The schema is hierarchical (cells contain their runs) with pre-computed statistics per cell. This follows Special Views Variation 3A, which maps naturally to how you think about matrix data: browse cells, drill into runs.

```json
{
  "version": 1,
  "config": {
    "iterations": 10,
    "warmup": 1,
    "workers": 6,
    "command": "npx playwright test tests/bench.spec.ts"
  },
  "matrix": {
    "chrome": [
      "118.0.5993.70",
      "119.0.6045.105",
      "120.0.6099.109",
      "121.0.6167.85",
      "122.0.6261.94",
      "123.0.6312.58"
    ],
    "refs": [
      {"name": "main", "sha": "e7f8a9b"},
      {"name": "v4.5.0", "sha": "c3d4e5f"},
      {"name": "v5.0.0-beta.1", "sha": "f9a0b1c"},
      {"name": "feature/virtual-list", "sha": "a1b2c3d"}
    ]
  },
  "summary": {
    "totalRuns": 240,
    "passed": 235,
    "failed": 5,
    "remaining": 0,
    "targetPerCell": 10,
    "cellsTotal": 24,
    "cellsComplete": 21,
    "cellsWithFailures": 3,
    "wallTimeMs": 968000,
    "firstRun": "2026-02-18T10:30:00.000Z",
    "lastRun": "2026-02-18T10:46:08.000Z"
  },
  "cells": [
    {
      "chrome": "118.0.5993.70",
      "ref": "main",
      "sha": "e7f8a9b",
      "target": 10,
      "passed": 10,
      "failed": 0,
      "complete": true,
      "stats": {
        "minMs": 3688,
        "maxMs": 4523,
        "meanMs": 4067,
        "medianMs": 4102
      },
      "runs": [
        {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "iteration": 0, "exitCode": 0, "durationMs": 4523, "timestamp": "2026-02-18T10:30:00.000Z"},
        {"id": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "iteration": 1, "exitCode": 0, "durationMs": 4210, "timestamp": "2026-02-18T10:30:05.000Z"}
      ]
    },
    {
      "chrome": "118.0.5993.70",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "target": 10,
      "passed": 8,
      "failed": 2,
      "complete": false,
      "stats": {
        "minMs": 2098,
        "maxMs": 3102,
        "meanMs": 2612,
        "medianMs": 2596
      },
      "runs": [
        {"id": "c3d4e5f6-a7b8-9012-cdef-123456789012", "iteration": 0, "exitCode": 0, "durationMs": 2301, "timestamp": "2026-02-18T10:35:00.000Z"},
        {"id": "d4e5f6a7-b8c9-0123-defa-234567890123", "iteration": 8, "exitCode": 1, "durationMs": 2891, "timestamp": "2026-02-18T10:38:12.000Z"},
        {"id": "e5f6a7b8-c9d0-1234-efab-345678901234", "iteration": 9, "exitCode": 1, "durationMs": 3102, "timestamp": "2026-02-18T10:39:44.000Z"}
      ]
    }
  ]
}
```

Note: `runs` arrays above are truncated for readability. In practice, every iteration (passed and failed) is included.

### Schema design notes

- **`version: 1`** -- enables future schema evolution. Fields may be added but never removed or renamed within a version. From Special Views.
- **`stats` per cell** -- pre-computed `min`, `max`, `mean`, `median` over successful runs only (exitCode === 0). This saves users from computing basic statistics in jq. The stats object is omitted for cells with zero successful runs. Borrowed from Special Views 3A.
- **`complete` boolean** -- `true` when `passed >= target`. Direct CI gate: `jq '.cells | all(.complete)'`. Simpler than the `"status": "complete"` string from Option A's JSON.
- **`summary.remaining`** -- counts iterations still needed for all cells to reach their target. Zero when the matrix is complete (even if some iterations failed, as long as enough passed).
- **`summary.firstRun` / `summary.lastRun`** -- timestamps for wall-time calculation and audit trails. From Special Views 3A.
- **`matrix.refs[].name`** -- uses `name` not `ref` for the field, to avoid confusion with the top-level `ref` field on cells. Consistent with Special Views 3A.
- **Output goes to stdout.** All other CLI output goes to stderr. This is what enables `chrome-ranger status --json | jq ...` to work without interference from progress output.

### `--json --failures` variant

When combined with `--failures`, only cells with failures appear in the `cells` array:

```bash
$ chrome-ranger status --json --failures | jq '.cells | length'
3
```

The `summary` still reflects the full matrix. Only `cells` is filtered.

### Typical usage

```bash
# CI gate: are all cells complete with no failures?
chrome-ranger status --json | jq -e '.summary.remaining == 0 and .summary.failed == 0'

# Median duration per cell (for benchmark comparison)
chrome-ranger status --json | jq -r '.cells[] | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'

# Get all failed run IDs for investigation
chrome-ranger status --json | jq '[.cells[].runs[] | select(.exitCode != 0) | .id]'

# Export to CSV for spreadsheet analysis
chrome-ranger status --json | jq -r '.cells[].runs[] | [.chrome, .ref, .iteration, .durationMs, .exitCode] | @csv'

# Feed to pandas
# chrome-ranger status --json | python3 -c "
#   import json, sys, pandas as pd
#   data = json.load(sys.stdin)
#   runs = [dict(r, chrome=c['chrome'], ref=c['ref']) for c in data['cells'] for r in c['runs']]
#   df = pd.DataFrame(runs)
#   print(df.groupby(['chrome', 'ref'])['durationMs'].describe())
# "
```

The hierarchical schema requires a small flatten step for pandas (shown above), but this is a one-liner. The tradeoff is worth it: hierarchical access for jq (the 90% case) is cleaner, and the pre-computed `stats` object means most jq queries never need to touch individual runs at all.

---

## Cross-Pollination Notes

Elements borrowed from other drafts and why:

### From Option A (Live Matrix Grid)

1. **Block-character progress bars** (`█████`, `░░░░░`) -- replaced D3's bracket bars (`[====>    ]`). Block chars are 5 chars vs 11 chars for the same information. They have better shape recognition: a half-filled bar is instantly readable as a bar, while `[====>    ]` requires parsing the bracket boundaries. Every cell saves 6 characters, which adds up across the matrix. From A1.

2. **`✓` and `✗N` suffixes** -- replaced D's `ok` and `FAIL` labels. `✓` is 1 char vs 2 (`ok`). `✗1` is 2 chars vs 4 (`FAIL`) while also encoding the count. The `✗` character at failure positions inside the bar (e.g., `███✗░`) was directly taken from A1. It answers "which iteration failed?" without needing a separate view.

3. **Drop denominator for complete cells at scale** -- `10 ✓` instead of `10/10 ✓`. Saves 3 chars per complete cell in the large matrix. When you are scanning a 6x4 grid, the complete cells are not the ones you care about; they can afford to be compressed. In-progress and failed cells always show the full fraction. From A1's large matrix state.

4. **Dot sequences in `--failures` view** (`●●●✗●`) -- borrowed from A2. During the live run, the block bars show failures at positions. But in the static `--failures` view, the dot sequence is more readable because each dot is separated and you can count individual iterations. The visual language is consistent (left-to-right = iteration order) but the glyph choice is optimized for the context: blocks for dense live display, dots for detailed post-mortem.

5. **Worker packing 2-per-line** with truncation and `(idle)` dimming -- the concept of packing workers horizontally came from D3 but was validated by A2's worker strip and A3's ticker approach. A3's `+2` overflow indicator was considered but rejected: with 2-per-line packing, 6 workers only need 3 lines, and 8 workers need 4, which is acceptable without truncation.

### From Special Views

6. **Pattern detection in `--failures`** -- the "Pattern:" line at the bottom of the failures view is borrowed from Special Views 2B. It synthesizes the most actionable insight from the failure data: "all on ref X", "same error", "only late iterations". This is the highest-value addition from any of the drafts. It turns the failures view from a listing into an analysis.

7. **Stderr deduplication** -- from Special Views 2A. When multiple failures in the same cell have identical stderr, showing it once with "both identical" is cleaner than repeating it. In benchmark scenarios, the same timeout error appearing 5 times is noise.

8. **Pre-computed `stats` object in JSON** -- from Special Views 3A. Having `min`, `max`, `mean`, `median` per cell in the JSON output means the 80% use case (comparing performance across cells) is a one-liner in jq without any arithmetic. The stats are computed over successful runs only.

9. **`version: 1` in JSON schema** -- from Special Views 3A/3B. Simple forward-compatibility mechanism.

10. **`complete` boolean instead of `status` string** -- from Special Views 3A (`"complete": true`) instead of Option A's `"status": "complete"`. A boolean is easier to query: `jq '.cells | all(.complete)'` vs `jq '.cells | all(.status == "complete")'`. There are only two states that matter: complete or not.

11. **`summary.firstRun` / `summary.lastRun` timestamps** -- from Special Views 3A. Enables wall-time calculation without requiring the CLI to track it separately, and provides audit trail information.

### What was NOT borrowed

- **Box-drawing characters** (from D2, Special Views 1C). They add visual noise and terminal compatibility risk for minimal benefit. The plain `---`/`===` separators are sufficient.
- **A3's in-cell spinner** (`3/5 ⣾`). Clever, but it means you cannot tell at a glance whether a cell has an active worker vs just being partially complete. The separate worker section is clearer and shows elapsed time per worker, which matters for detecting stuck processes.
- **A2's full dot-per-iteration in the live display**. The dots take more width than block bars for the same information (10 dots + spaces vs 10 block chars), and in the live display during a long run, the approximate shape of the block bar is more immediately scannable than counting individual dots.
- **Special Views 3B's flat `runs` array**. The denormalized flat structure is friendlier for pandas but worse for jq (which is the primary consumer). The hierarchical structure from 3A was chosen. Pandas users can flatten with a one-liner.
- **Special Views 2C's failure matrix overview**. Showing a mini-matrix in the failures view before drill-down is visually appealing but redundant: the user just saw the matrix in the live display (or can run `status` to see it again). The failures view should focus on the "why", not re-present the "where".
- **Duration ranges in the status view** (from Special Views 1C). Duration data belongs in `--json` output, not in the ASCII status display. Adding min-max ranges to every cell would make the matrix much wider and blur the line between "status" and "analysis" -- which violates chrome-ranger's core design principle that analysis is the user's responsibility.
