# Option A Variations: Live Matrix Grid with Worker Status

Three variations of the Option A approach (live matrix grid), each showing real-time
worker activity. All use ANSI cursor control to redraw in-place. The entire display
fits in the terminal and updates every ~100ms.

**Standard matrix used in Variations** (from DESIGN.md unless noted):

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

3x3 matrix = 9 cells x 5 iterations = 45 total runs + 9 warmups.

**Large matrix used for scaling tests:**

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

6x4 matrix = 24 cells x 10 iterations = 240 total runs + 24 warmups.

**Color conventions** (referenced but not rendered in this Markdown):

- Green: completed successfully
- Red: failure marker
- Yellow/dim: in-progress / active worker
- Gray/dim: not started
- Bold white: header text, summary line

---

## Variation A1: Dense Grid with Right-Aligned Worker Panel

The matrix and worker panel occupy the same vertical space. The grid is on the
left, workers are stacked on the right. This is the most space-efficient layout:
the worker panel sits beside the grid rather than below it, keeping total height
under 15 lines for the standard matrix.

**Design principles:**
- Progress bars are 5 chars wide (one block per iteration) — exact count, not proportional
- Each `█` = one passed iteration, `░` = remaining, `✗` = failed iteration
- Workers panel right-aligned, separated by a vertical `│` divider
- Elapsed time ticks up live on active workers
- Summary line at top includes spinner, fraction, percent, and elapsed wall time

### A1 State 1: Early run (6/45 done)

```
chrome-ranger run  6/45  13%  ⣾  elapsed 0:38          ┃  Workers
                                                        ┃
              main         v4.5.0       feat/virtual-list┃  w1  chrome@120 × v4.5.0 #2       3.1s
chrome@120   ██░░░ 2/5    ██░░░ 2/5    ░░░░░ 0/5       ┃  w2  chrome@121 × main #2          1.8s
chrome@121   ██░░░ 2/5    ░░░░░ 0/5    ░░░░░ 0/5       ┃  w3  idle
chrome@122   ░░░░░ 0/5    ░░░░░ 0/5    ░░░░░ 0/5       ┃  w4  idle
```

**Width: 84 columns.** The `feat/virtual-list` header is truncated to `feat/virtual-list`
(18 chars). Ref column headers are truncated to fit; the SHA is omitted in the grid
header to save space (shown in the worker panel when active).

### A1 State 2: Mid-run with failures (28/45 done)

```
chrome-ranger run  28/45  62%  ⣾  elapsed 2:04         ┃  Workers
                                                        ┃
              main         v4.5.0       feat/virtual-list┃  w1  chrome@121 × v4.5.0 #3       2.4s
chrome@120   █████ 5/5 ✓  █████ 5/5 ✓  ███✗░ 4/5 ✗1   ┃  w2  chrome@121 × feat/vl #1      4.1s
chrome@121   █████ 5/5 ✓  ███░░ 3/5    █░░░░ 1/5       ┃  w3  chrome@122 × main #4          0.6s
chrome@122   ████░ 4/5    ░░░░░ 0/5    █░░░░ 1/5       ┃  w4  chrome@122 × feat/vl #1      3.2s
```

Notes:
- `███✗░` — the `✗` occupies a block position showing where the failure is in the
  sequence. The count `4/5` means 4 passed; `✗1` means 1 failed.
- Completed cells get a `✓` suffix. Cells with any failure get `✗N`.
- Workers show abbreviated ref names when space is tight (`feat/vl`).

### A1 State 3: Complete with failures (45/45)

```
chrome-ranger run  45/45  100%  done in 3m 22s

              main         v4.5.0       feat/virtual-list
chrome@120   █████ 5/5 ✓  █████ 5/5 ✓  ████✗ 4/5 ✗1
chrome@121   █████ 5/5 ✓  █████ 5/5 ✓  █████ 5/5 ✓
chrome@122   █████ 5/5 ✓  █████ 5/5 ✓  ████✗ 4/5 ✗1

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
Failures in: chrome@120 × feat/virtual-list, chrome@122 × feat/virtual-list
```

Notes:
- Worker panel disappears on completion (no active workers).
- Failed cells are summarized in a final line so the user knows exactly which
  cells to investigate.
- The divider `┃` and worker column are removed, reclaiming width.

### A1 State 4: Large matrix (6x4, iterations: 10, workers: 6)

```
chrome-ranger run  87/240  36%  ⣾  elapsed 4:12        ┃  Workers
                                                        ┃
              main         v4.5.0       v5.0-beta.1  fvl┃  w1  chrome@120 × v5.0-b1 #7     2.1s
chrome@118   ██████████ ✓  ██████████ ✓  ████████░░ 8   ┃  w2  chrome@120 × fvl #4         3.8s
chrome@119   ██████████ ✓  ██████████ ✓  ██████░░░░ 6   ┃  w3  chrome@121 × main #3        1.2s
chrome@120   ██████████ ✓  █████████░ 9  ████░░░░░░ 4   ┃  w4  chrome@121 × v4.5.0 #1     0.4s
chrome@121   █████████░ 9  ███░░░░░░░ 3  ░░░░░░░░░░ 0   ┃  w5  chrome@120 × fvl #5         4.5s
chrome@122   ████░░░░░░ 4  ░░░░░░░░░░ 0  ░░░░░░░░░░ 0   ┃  w6  chrome@121 × v4.5.0 #2     0.9s
chrome@123   ░░░░░░░░░░ 0  ░░░░░░░░░░ 0  ░░░░░░░░░░ 0   ┃
```

Notes:
- Column headers shorten aggressively: `v5.0-beta.1` -> `v5.0-beta.1`, `feature/virtual-list` -> `fvl`.
  Truncation strategy: try progressively shorter forms — strip `feature/`, abbreviate
  segments, then use initials. Full names live in the worker panel.
- Progress bars are 10 chars (one per iteration). This is exact: block `N` lights up
  when iteration `N` passes.
- Completed cells just show `✓` instead of `10/10 ✓` to save space. In-progress cells
  show the count.
- 6 workers stack neatly. The right panel is ~38 chars wide.
- **Total width: ~98 columns.** Fits a 100-col terminal.
- **Total height: 10 lines** (header + blank + col headers + 6 rows + blank). With workers
  merged into the right side, there is no additional height cost.

**At 120 columns**, there is room to show the count on completed cells too:

```
chrome@118   ██████████ 10/10 ✓  ██████████ 10/10 ✓  ████████░░ 8/10    ░░░░░░░░░░ 0/10
```

---

## Variation A2: Expanded Grid with Dot Iterations and Bottom Worker Strip

Each matrix cell shows individual iteration outcomes as a sequence of dots/symbols.
The worker panel sits below the grid as a horizontal strip. This prioritizes
readability and per-iteration visibility at the cost of more vertical space.

**Design principles:**
- Each iteration is a single character: `●` = passed, `○` = pending, `✗` = failed, `◌` = running
- Cell status is not a bar but a character sequence: `●●●○○` means 3 done, 2 pending
- Worker strip at the bottom is a compact horizontal row, one line per worker
- Header uses SHAs in parentheses for git precision
- More vertical: ~20 lines for the standard matrix

### A2 State 1: Early run (6/45 done)

```
chrome-ranger run  ━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  6/45  13%  0:38

                    main (e7f8a9b)    v4.5.0 (c3d4e5f)    feat/virtual-list (a1b2c3d)
  chrome@120        ●●○○○             ●●○○○                ○○○○○
  chrome@121        ●●○○○             ○○○○○                ○○○○○
  chrome@122        ○○○○○             ○○○○○                ○○○○○

─── workers ────────────────────────────────────────────────────────────────────
  w1  ◌  chrome@120 × v4.5.0 (c3d4e5f) iter #2                       3.1s
  w2  ◌  chrome@121 × main (e7f8a9b) iter #2                          1.8s
  w3     idle
  w4     idle
```

Notes:
- The top progress bar is a thin `━` track with fill, giving overall progress at a glance.
- Dots are wide-spaced so each iteration is clearly distinct.
- The `◌` marker appears both in the worker strip and could optionally blink in the
  grid cell itself (implementation choice).
- Idle workers are dimmed.

### A2 State 2: Mid-run with failures (28/45 done)

```
chrome-ranger run  ━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░  28/45  62%  2:04

                    main (e7f8a9b)    v4.5.0 (c3d4e5f)    feat/virtual-list (a1b2c3d)
  chrome@120        ●●●●●  5/5 ✓     ●●●●●  5/5 ✓        ●●●✗○  4/5  1 fail
  chrome@121        ●●●●●  5/5 ✓     ●●●○○  3/5           ●○○○○  1/5
  chrome@122        ●●●●○  4/5       ○○○○○  0/5           ●○○○○  1/5

─── workers ────────────────────────────────────────────────────────────────────
  w1  ◌  chrome@121 × v4.5.0 (c3d4e5f) iter #3                       2.4s
  w2  ◌  chrome@121 × feat/virtual-list (a1b2c3d) iter #1             4.1s
  w3  ◌  chrome@122 × main (e7f8a9b) iter #4                          0.6s
  w4  ◌  chrome@122 × feat/virtual-list (a1b2c3d) iter #1             3.2s
```

Notes:
- `●●●✗○` — you can see exactly which iteration failed (iteration #3). The `✗` is
  red in the terminal. The remaining `○` is still pending.
- Completed cells collapse to `5/5 ✓` text. In-progress cells show count only when
  partially filled.
- The worker strip always shows full ref names and SHAs — there is room because it
  spans the full terminal width.

### A2 State 3: Complete with failures (45/45)

```
chrome-ranger run  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  45/45  100%  3:22

                    main (e7f8a9b)    v4.5.0 (c3d4e5f)    feat/virtual-list (a1b2c3d)
  chrome@120        ●●●●●  5/5 ✓     ●●●●●  5/5 ✓        ●●●✗●  4/5  1 fail
  chrome@121        ●●●●●  5/5 ✓     ●●●●●  5/5 ✓        ●●●●●  5/5 ✓
  chrome@122        ●●●●●  5/5 ✓     ●●●●●  5/5 ✓        ●●✗●●  4/5  1 fail

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)

  chrome@120 × feat/virtual-list (a1b2c3d)  iter #3  exit:1  2891ms
  chrome@122 × feat/virtual-list (a1b2c3d)  iter #2  exit:1  2891ms

Run with --refs feature/virtual-list to retry failed cells.
```

Notes:
- Worker strip is replaced by a failure summary listing each failed iteration
  with its exit code and duration.
- The dot sequences persist, so you can see that `✗` at positions #3 and #2
  respectively. This is unique to A2: you always know which specific iterations
  failed.
- Retry hint uses the actual ref name.

### A2 State 4: Large matrix (6x4, iterations: 10, workers: 6)

```
chrome-ranger run  ━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░  87/240  36%  4:12

                    main (e7f8a9b)      v4.5.0 (c3d4e5f)     v5.0-beta.1 (b8c9d0e)   fvl (a1b2c3d)
  chrome@118        ●●●●●●●●●●  10 ✓   ●●●●●●●●●●  10 ✓    ●●●●●●●●○○  8/10        ○○○○○○○○○○
  chrome@119        ●●●●●●●●●●  10 ✓   ●●●●●●●●●●  10 ✓    ●●●●●●○○○○  6/10        ○○○○○○○○○○
  chrome@120        ●●●●●●●●●●  10 ✓   ●●●●●●●●●○  9/10    ●●●●○○○○○○  4/10        ○○○○○○○○○○
  chrome@121        ●●●●●●●●●○  9/10   ●●●○○○○○○○  3/10    ○○○○○○○○○○  0/10        ○○○○○○○○○○
  chrome@122        ●●●●○○○○○○  4/10   ○○○○○○○○○○  0/10    ○○○○○○○○○○  0/10        ○○○○○○○○○○
  chrome@123        ○○○○○○○○○○  0/10   ○○○○○○○○○○  0/10    ○○○○○○○○○○  0/10        ○○○○○○○○○○

─── workers ────────────────────────────────────────────────────────────────────
  w1  ◌  chrome@120 × v5.0-beta.1 #7    2.1s    w4  ◌  chrome@121 × v4.5.0 #1     0.4s
  w2  ◌  chrome@120 × fvl #4            3.8s    w5  ◌  chrome@120 × fvl #5         4.5s
  w3  ◌  chrome@121 × main #3           1.2s    w6  ◌  chrome@121 × v4.5.0 #2     0.9s
```

Notes:
- 10 dots per cell uses exactly 10 columns. Combined with counts (max 5 chars for
  `10/10`) and spacing, each column is ~20 chars. Four columns = 80 chars + row
  labels = ~95 chars. Fits 100 columns.
- Workers switch to a 2-column layout when there are 5+ workers. This keeps the
  worker strip to 3 lines instead of 6.
- `fvl` = abbreviated `feature/virtual-list`. The abbreviation strategy:
  1. Strip common prefixes (`feature/`, `bugfix/`)
  2. If still > 18 chars, take initials of path segments
  3. In worker panel: use same abbreviation but show full name on hover (N/A in
     terminal; the `status --failures` view shows full names)
- **Total height: 12 lines** (header + blank + col headers + 6 rows + blank + divider + 3 worker lines).
- **Total width: ~96 columns.**

**Scaling concern at 120 columns:** With extra width, the dots can be spaced out
or the count columns can show `10/10 ✓` instead of just `10 ✓`:

```
  chrome@118        ● ● ● ● ● ● ● ● ● ●  10/10 ✓     ● ● ● ● ● ● ● ● ● ●  10/10 ✓
```

This spaced variant is more readable but only viable at wider terminals. Detection
of `process.stderr.columns` determines which format to use.

---

## Variation A3: Compact Grid with Integrated Worker Markers

The workers are not shown in a separate panel. Instead, active workers are
indicated directly *inside* the matrix cells with a pulsing marker. A single
status line below the grid shows a brief summary of what is running. This is the
most compact layout — ideal for large matrices where a worker panel would push
the display off-screen.

**Design principles:**
- Cells use a short progress format: `3/5` with a color background or a small
  inline bar `▰▰▰▱▱`
- The currently-active cell gets a spinner suffix: `3/5 ⣾` — this tells you a
  worker is executing in that cell right now
- A one-line "now running" ticker at the bottom scrolls through active tasks
- Failures shown with `✗N` suffix, colored red
- Absolute minimum height: header + column headers + matrix rows + ticker = matrix_rows + 4

### A3 State 1: Early run (6/45 done)

```
chrome-ranger run  6/45  13%  ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  0:38

                 main          v4.5.0         feat/virtual-list
chrome@120      2/5            2/5 ⣾          0/5
chrome@121      2/5 ⣾         0/5             0/5
chrome@122      0/5            0/5             0/5

  ▸ w1 chrome@120 × v4.5.0 #2 (3.1s)  w2 chrome@121 × main #2 (1.8s)
```

Notes:
- The spinners `⣾` inside cells `2/5 ⣾` and `2/5 ⣾` show exactly which cells
  have active workers. The braille spinner cycles through `⣾⣽⣻⢿⡿⣟⣯⣷`.
- The bottom ticker `▸` line shows all active workers in a single row. If workers
  exceed one line, it wraps or truncates with `+2 more`.
- Idle workers are not shown (they are implicit — if not listed, they are idle).
- **Total height: 7 lines.** This is dramatically shorter than A1 or A2.
- **Total width: ~82 columns.**

### A3 State 2: Mid-run with failures (28/45 done)

```
chrome-ranger run  28/45  62%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  2:04

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ✓          5/5 ✓          4/5 ✗1
chrome@121      5/5 ✓          3/5 ⣾          1/5 ⣾
chrome@122      4/5 ⣾         0/5             1/5 ⣾

  ▸ w1 121×v4.5.0 #3 (2.4s)  w2 121×fvl #1 (4.1s)  w3 122×main #4 (0.6s)  w4 122×fvl #1 (3.2s)
```

Notes:
- `4/5 ✗1` — four passed, one failed. The `✗1` is red. The cell is not yet complete
  (one iteration still pending).
- Three cells show `⣾` — but there are 4 workers active. Two workers target the
  same cell: `chrome@121 × feat/virtual-list` has both `w2` at iter #1. Wait — that
  cannot happen (iterations are dispatched individually). Actually what is happening:
  different cells have spinners. Let me reconsider. With 4 workers active and 4 cells
  showing `⣾`, that matches. But `chrome@122 × main` has a worker on `#4` and shows
  `4/5 ⣾`. Yes, 4 completed + 1 running = consistent.
- The ticker abbreviates to `121×v4.5.0` when width is tight. The abbreviation
  strategy: drop `chrome@` prefix, shorten ref name.

### A3 State 3: Complete with failures (45/45)

```
chrome-ranger run  45/45  100%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  3:22

                 main          v4.5.0         feat/virtual-list
chrome@120      5/5 ✓          5/5 ✓          4/5 ✗1
chrome@121      5/5 ✓          5/5 ✓          5/5 ✓
chrome@122      5/5 ✓          5/5 ✓          4/5 ✗1

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
  ✗ chrome@120 × feat/virtual-list (a1b2c3d)  iter #3  exit:1
  ✗ chrome@122 × feat/virtual-list (a1b2c3d)  iter #2  exit:1
```

Notes:
- No spinners, no ticker. The grid is frozen.
- Failed iterations listed below with `✗` prefix.
- The progress bar is full but the failure count is prominent.

### A3 State 4: Large matrix (6x4, iterations: 10, workers: 6)

```
chrome-ranger run  87/240  36%  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  4:12

                 main          v4.5.0         v5.0-beta.1    fvl
chrome@118      10 ✓           10 ✓           8/10 ⣾        0/10
chrome@119      10 ✓           10 ✓           6/10           0/10
chrome@120      10 ✓           9/10           4/10 ⣾        0/10 ⣾
chrome@121      9/10 ⣾        3/10 ⣾         0/10           0/10
chrome@122      4/10           0/10           0/10           0/10
chrome@123      0/10           0/10           0/10           0/10

  ▸ w1 118×v5.0b1 #8 (2.1s)  w2 120×fvl #4 (3.8s)  w3 121×main #3 (1.2s)  w4 121×v4.5 #1 (0.4s)  +2
```

Notes:
- **Total height: 11 lines.** Compare to A2 at 12 lines — but A3 achieves this
  without a separate worker section. The worker info is embedded in the grid
  (spinners) and summarized in one ticker line.
- **Total width: ~92 columns.**
- `+2` at end of ticker means 2 more workers are active but truncated. The user
  can see which cells they are in because those cells have `⣾` spinners.
- Completed cells show just `10 ✓` (no denominator needed when complete). This
  saves 3 chars per cell.
- Four `⣾` spinners visible in the grid correspond to 4 of the 6 active workers.
  The other 2 are the `+2` in the ticker. (All 6 have spinners in their cells;
  the ticker just can't list all 6 in one line.)

Actually, let me correct that: all 6 workers would show spinners in their respective
cells. Let me recount. w1 is on `118×v5.0-beta.1`, w2 on `120×fvl`, w3 on `121×main`,
w4 on `121×v4.5.0`, w5 on `120×fvl` (same cell as w2), w6 on `121×v4.5.0` (same cell
as w4). So we have 4 distinct cells with spinners, powered by 6 workers (two cells
have 2 workers each). The grid correctly shows 4 spinners.

With two workers in the same cell, the spinner could optionally double: `4/10 ⣾⣾`
to indicate parallelism depth — but this may be too subtle and is an implementation
detail.

---

## Special Views: `--failures` and `--json`

These views are available during `chrome-ranger status` and also as post-run output
when relevant. They are not ANSI-rewritten — they are static, pipe-friendly output.

### `chrome-ranger status --failures`

Shows only cells with at least one failed iteration. Includes the stderr excerpt
(first 3 lines) from the output file. Designed to be the first thing you check
after a run with failures.

```
$ chrome-ranger status --failures

2 cells with failures (2 iterations failed out of 45 total)

chrome@120 × feature/virtual-list (a1b2c3d)
  ●●●✗●  4/5 passed, 1 failed
  #3  exit:1  2891ms  id:f7g8h9
      Error: Timed out waiting for selector "tr:nth-child(1000)"
          at bench.spec.ts:5:15

chrome@122 × feature/virtual-list (a1b2c3d)
  ●●✗●●  4/5 passed, 1 failed
  #2  exit:1  2891ms  id:k4l5m6
      Error: Timed out waiting for selector "tr:nth-child(1000)"
          at bench.spec.ts:5:15

Retry: chrome-ranger run --refs feature/virtual-list
Full stderr: cat .chrome-ranger/output/f7g8h9.stderr
```

Notes:
- The dot sequence `●●●✗●` appears here too (borrowed from A2), showing which
  iteration failed. This is consistent with the live display in A2 and useful
  across all variations.
- Each failed iteration shows: iteration number, exit code, duration, run ID.
- Stderr is truncated to first 3 lines. Full path to the stderr file is shown.
- The retry command at the bottom is a copy-pasteable suggestion.

**Large matrix with many failures:**

```
$ chrome-ranger status --failures

8 cells with failures (14 iterations failed out of 240 total)

chrome@118 × feature/virtual-list (a1b2c3d)
  ●●●●●●✗●●✗  8/10 passed, 2 failed
  #6   exit:1   2891ms  id:a1b2c3
  #9   exit:1   3102ms  id:d4e5f6
       Error: Timed out waiting for selector "tr:nth-child(1000)"

chrome@119 × feature/virtual-list (a1b2c3d)
  ●●●✗●✗●●✗●  7/10 passed, 3 failed
  #3   exit:1   2755ms  id:g7h8i9
  #5   exit:1   2891ms  id:j0k1l2
  #8   exit:1   3001ms  id:m3n4o5
       Error: Timed out waiting for selector "tr:nth-child(1000)"

  ... (6 more cells)

Retry: chrome-ranger run --refs feature/virtual-list
```

When there are many failing cells, the output groups by ref (if all failures share
a ref) and offers a collapsed view with `... (6 more cells)`. Use `--failures --verbose`
to see all cells expanded.

### `chrome-ranger status --json`

Machine-readable JSON output for scripting, CI integration, and custom dashboards.
Sent to stdout (not stderr) so it composes cleanly with pipes.

```
$ chrome-ranger status --json
```

```json
{
  "config": {
    "iterations": 5,
    "warmup": 1,
    "workers": 4,
    "command": "npx playwright test"
  },
  "matrix": {
    "chrome": [
      "120.0.6099.109",
      "121.0.6167.85",
      "122.0.6261.94"
    ],
    "refs": [
      { "ref": "main", "sha": "e7f8a9b" },
      { "ref": "v4.5.0", "sha": "c3d4e5f" },
      { "ref": "feature/virtual-list", "sha": "a1b2c3d" }
    ]
  },
  "cells": [
    {
      "chrome": "120.0.6099.109",
      "ref": "main",
      "sha": "e7f8a9b",
      "target": 5,
      "passed": 5,
      "failed": 0,
      "status": "complete",
      "runs": [
        { "id": "a1b2c3", "iteration": 0, "durationMs": 4523, "exitCode": 0, "timestamp": "2026-02-18T10:30:00Z" },
        { "id": "d4e5f6", "iteration": 1, "durationMs": 4210, "exitCode": 0, "timestamp": "2026-02-18T10:31:02Z" },
        { "id": "g7h8i9", "iteration": 2, "durationMs": 4102, "exitCode": 0, "timestamp": "2026-02-18T10:32:05Z" },
        { "id": "j0k1l2", "iteration": 3, "durationMs": 4198, "exitCode": 0, "timestamp": "2026-02-18T10:33:08Z" },
        { "id": "m3n4o5", "iteration": 4, "durationMs": 4301, "exitCode": 0, "timestamp": "2026-02-18T10:34:11Z" }
      ]
    },
    {
      "chrome": "120.0.6099.109",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "target": 5,
      "passed": 4,
      "failed": 1,
      "status": "incomplete",
      "runs": [
        { "id": "p6q7r8", "iteration": 0, "durationMs": 2301, "exitCode": 0, "timestamp": "2026-02-18T10:30:01Z" },
        { "id": "s9t0u1", "iteration": 1, "durationMs": 2455, "exitCode": 0, "timestamp": "2026-02-18T10:31:03Z" },
        { "id": "v2w3x4", "iteration": 2, "durationMs": 2189, "exitCode": 0, "timestamp": "2026-02-18T10:32:06Z" },
        { "id": "f7g8h9", "iteration": 3, "durationMs": 2891, "exitCode": 1, "timestamp": "2026-02-18T10:33:09Z" },
        { "id": "y5z6a7", "iteration": 4, "durationMs": 2210, "exitCode": 0, "timestamp": "2026-02-18T10:34:12Z" }
      ]
    }
  ],
  "summary": {
    "totalIterations": 45,
    "passed": 43,
    "failed": 2,
    "remaining": 0,
    "cellsComplete": 7,
    "cellsIncomplete": 2,
    "cellsTotal": 9,
    "wallTimeMs": 202000
  }
}
```

Notes:
- `status` field per cell: `"complete"` (all iterations passed), `"incomplete"`
  (has failures or missing iterations), `"empty"` (no runs yet).
- Every run is included in the `runs` array, including failures. This lets
  downstream tools compute their own statistics.
- `summary.remaining` counts iterations that still need a successful run.
- `wallTimeMs` is only present if a run has completed (read from the span between
  first and last timestamp).

**Compact variant:** `chrome-ranger status --json --compact` omits the `runs` array
and just shows cell-level summaries:

```json
{
  "cells": [
    { "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "target": 5, "passed": 5, "failed": 0, "status": "complete" },
    { "chrome": "120.0.6099.109", "ref": "feature/virtual-list", "sha": "a1b2c3d", "target": 5, "passed": 4, "failed": 1, "status": "incomplete" }
  ],
  "summary": { "totalIterations": 45, "passed": 43, "failed": 2, "remaining": 0 }
}
```

This is useful for quick CI checks: `chrome-ranger status --json --compact | jq '.summary.failed'`.

---

## Comparison Table

| Property                    | A1: Dense + Side Panel    | A2: Dots + Bottom Strip    | A3: Compact + Spinners    |
|-----------------------------|---------------------------|----------------------------|---------------------------|
| Per-iteration visibility    | No (bar only)             | Yes (each dot = iteration) | No (count only)           |
| Worker display              | Right panel, always visible| Bottom strip, 1 line/worker| Inline spinners + ticker  |
| Height (3x3 matrix)        | ~8 lines                  | ~12 lines                  | ~7 lines                  |
| Height (6x4 matrix)        | ~10 lines                 | ~14 lines                  | ~11 lines                 |
| Width (3x3, 100 col)       | 84 cols                   | ~92 cols                   | ~82 cols                  |
| Width (6x4, 100 col)       | 98 cols                   | ~96 cols                   | ~92 cols                  |
| Failure visibility          | `✗N` suffix               | `✗` at exact position      | `✗N` suffix               |
| Identify stuck worker       | Yes (elapsed time)        | Yes (elapsed time)         | Partial (spinner + ticker)|
| Scales to 8x6 matrix?      | Tight at 100 cols         | Needs 120+ cols            | Comfortable at 100 cols   |
| Implementation complexity   | Medium                    | Medium-high                | Low-medium                |
| Pipe/non-TTY fallback       | Needs separate fallback   | Needs separate fallback    | Needs separate fallback   |

### Recommendations

**For the default live display:** A1 is the strongest all-around choice. It balances
density with readability, the side-panel worker display is natural to scan, and it
scales well. The progress bars give instant shape recognition without the noise of
individual dots.

**If per-iteration granularity matters:** A2 is the best choice for benchmark-heavy
workflows where knowing *which* specific iteration failed is important during the
live run, not just after.

**If terminal height is precious:** A3 is the most compact. It works well for large
matrices and for users who embed chrome-ranger in a tmux pane or CI log. The spinner
integration is clever but makes it harder to see worker elapsed time at a glance.

**Hybrid approach:** Use A1 as the default, but let A2's dot notation appear in
`status --failures` (as shown above). The best of both: clean bars during the run,
precise dots when investigating failures.
