# Option D Variations: Hybrid Matrix Header + Scrolling Log

Deep exploration of the "pinned header with scrolling log" approach for the `chrome-ranger run` live display. Three variations, each shown across multiple states and matrix sizes.

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

## Implementation Notes (All Variations)

**Terminal mechanics.** The header occupies the top N lines of the visible terminal. On each tick (~100ms or on completion events), the cursor is moved to line 1 via `\x1b[1;1H`, the header is redrawn, and the cursor is repositioned below the header. New log lines are written with normal `\n`-terminated writes so they scroll naturally. The header region is protected with `\x1b[{N};r` (set scroll region) so the scrolling log only scrolls within the area below the header.

**Non-TTY fallback.** When `!process.stderr.isTTY`, skip the header entirely and emit only the scrolling log lines (Option B style). This is detected once at startup.

**Color usage.** All variations assume 256-color support. Failures are red (`\x1b[31m`), successes are green (`\x1b[32m`), active/in-progress is yellow (`\x1b[33m`), dimmed text is `\x1b[2m`. The header background uses no color fills to stay readable on both dark and light terminals.

**Transition on completion.** When all iterations finish, the header redraws one final time (replacing the spinner and worker lines with a summary), then the scroll region is reset, and the cursor is placed after the last log line. The terminal is left in a clean state.

---

## Variation 1: Dense Grid Header with Worker Sidebar

The header packs the matrix into a tight grid on the left and stacks active worker status on the right. The matrix cells use single-character glyphs for maximum density. The overall progress bar spans the full width above everything.

**Design principles:**
- Header height is fixed: 2 (progress + blank) + max(matrix rows, worker rows) + 1 (separator) = predictable
- Matrix cells are 5 chars wide: `3/5*` where `*` is a status glyph
- Workers display on the right side, sharing rows with the matrix
- Separator between header and log is a plain `---` line (no box drawing -- less likely to break)

### Standard Matrix (3x3, workers: 4)

**State: Early run -- 6/45 done, warmup finished**

```
chrome-ranger  [=========>..............................]   6/45   13%   0:41

            main       v4.5.0     v5.0.0-b     W1  chrome@120 x v4.5.0 #2         3.1s
 chrome@120 2/5 .      2/5 .      0/5 -        W2  chrome@121 x main #2            1.8s
 chrome@121 2/5 .      0/5 -      0/5 -        W3  (idle)
 chrome@122 0/5 -      0/5 -      0/5 -        W4  (idle)
---
  [ 1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
  [ 2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
  [ 3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
  [ 4/45] chrome@121 x main (e7f8a9b) #1                  4198ms  exit:0
  [ 5/45] chrome@120 x v4.5.0 (c3d4e5f) #0                3891ms  exit:0
  [ 6/45] chrome@120 x v4.5.0 (c3d4e5f) #1                3744ms  exit:0
```

Header height: 5 lines (progress, 3 matrix rows, separator). Total pinned: 5 lines.

Glyphs: `-` not started, `.` in progress (has active worker), checkmark on completion, `!` has failures.

**State: Mid-run -- 28/45 done, 1 failure**

```
chrome-ranger  [========================>...............]  28/45   62%   2:14   1 failed

            main       v4.5.0     v5.0.0-b     W1  chrome@121 x v4.5.0 #3         2.4s
 chrome@120 5/5 ok     5/5 ok     4/5 FAIL     W2  chrome@121 x v5.0.0-b #1       4.1s
 chrome@121 5/5 ok     3/5 .      1/5 .        W3  chrome@122 x main #4            0.6s
 chrome@122 4/5 .      0/5 -      1/5 .        W4  chrome@122 x v5.0.0-b #1       3.2s
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

The failure on iteration 21 is visible in the scrolling log with `FAIL` suffix (rendered in red). The matrix header shows `4/5 FAIL` for that cell (also red).

**State: Complete -- 45/45 done, 2 failures**

On completion, the header transforms: the progress bar fills, the worker sidebar is replaced with a timing summary, and the separator changes to a double line.

```
chrome-ranger  [========================================]  45/45  100%   3m 22s   2 failed

            main       v4.5.0     v5.0.0-b
 chrome@120 5/5 ok     5/5 ok     4/5 FAIL          45 runs in 3m 22s
 chrome@121 5/5 ok     5/5 ok     5/5 ok             2 failed (1 cell)
 chrome@122 5/5 ok     5/5 ok     4/5 FAIL          .chrome-ranger/runs.jsonl
===
```

The scrolling log below the separator is now frozen and contains the full history. The terminal scroll region is released, so the user can scroll up through the log normally.

### Large Matrix (6x4, workers: 6)

**State: Early run -- 18/240 done**

```
chrome-ranger  [==>.....................................]  18/240    8%   1:12

            main       v4.5.0     v5.0.0-b   feat/vl    W1  chrome@119 x main #2            2.1s
 chrome@118 5/10 .     3/10 .     0/10 -     0/10 -     W2  chrome@118 x v4.5.0 #3          3.8s
 chrome@119 5/10 .     2/10 .     0/10 -     0/10 -     W3  chrome@119 x v4.5.0 #2          1.4s
 chrome@120 3/10 .     0/10 -     0/10 -     0/10 -     W4  chrome@120 x main #3             0.9s
 chrome@121 0/10 -     0/10 -     0/10 -     0/10 -     W5  chrome@118 x v5.0.0-b #0        4.5s
 chrome@122 0/10 -     0/10 -     0/10 -     0/10 -     W6  chrome@118 x feat/vl #0         2.2s
 chrome@123 0/10 -     0/10 -     0/10 -     0/10 -
---
  [11/240] chrome@118 x main (e7f8a9b) #4                 4198ms  exit:0
  [12/240] chrome@119 x main (e7f8a9b) #3                 4088ms  exit:0
  [13/240] chrome@118 x v4.5.0 (c3d4e5f) #1               3744ms  exit:0
  [14/240] chrome@119 x main (e7f8a9b) #4                 4210ms  exit:0
  [15/240] chrome@120 x main (e7f8a9b) #0                 4523ms  exit:0
  [16/240] chrome@118 x v4.5.0 (c3d4e5f) #2               3802ms  exit:0
  [17/240] chrome@119 x v4.5.0 (c3d4e5f) #0               3688ms  exit:0
  [18/240] chrome@120 x main (e7f8a9b) #1                 4210ms  exit:0
```

Header height: 8 lines (progress, 6 matrix rows, separator). The matrix rows outnumber the worker rows (6 workers fit in 6 rows), so they share cleanly. When there are more matrix rows than workers, the extra rows just have blank space on the right.

**State: Mid-run -- 142/240, 3 failures**

```
chrome-ranger  [=====================>..................]  142/240  59%   9:48   3 failed

            main       v4.5.0     v5.0.0-b   feat/vl    W1  chrome@121 x v5.0.0-b #4       1.2s
 chrome@118 10/10 ok   10/10 ok   10/10 ok   9/10 FAIL  W2  chrome@122 x main #3            3.6s
 chrome@119 10/10 ok   10/10 ok   10/10 ok   10/10 ok   W3  chrome@121 x feat/vl #6         2.8s
 chrome@120 10/10 ok   10/10 ok   8/10 .     5/10 .     W4  chrome@122 x v4.5.0 #1          0.4s
 chrome@121 10/10 ok   7/10 .     4/10 .     2/10 .     W5  chrome@120 x feat/vl #7         4.1s
 chrome@122 3/10 .     1/10 .     0/10 -     0/10 -     W6  chrome@120 x v5.0.0-b #9       1.7s
 chrome@123 0/10 -     0/10 -     0/10 -     0/10 -
---
  [138/240] chrome@121 x main (e7f8a9b) #9                4088ms  exit:0
  [139/240] chrome@120 x v5.0.0-b (f9a0b1c) #7            2301ms  exit:0
  [140/240] chrome@118 x feat/vl (a1b2c3d) #8             2891ms  exit:1  FAIL
  [141/240] chrome@121 x v4.5.0 (c3d4e5f) #6              3402ms  exit:0
  [142/240] chrome@120 x v5.0.0-b (f9a0b1c) #8            2189ms  exit:0
```

Note: the ref column headers are truncated to fit. `feat/vl` is short for `feature/virtual-list`. The truncation rule: ref names longer than 8 characters are shortened. The full ref name appears in the log lines.

**State: Complete -- 240/240, 5 failures**

```
chrome-ranger  [========================================]  240/240  100%   16m 08s   5 failed

            main       v4.5.0     v5.0.0-b   feat/vl
 chrome@118 10/10 ok   10/10 ok   10/10 ok   9/10 FAIL       240 runs in 16m 08s
 chrome@119 10/10 ok   10/10 ok   10/10 ok   10/10 ok          5 failed across 3 cells
 chrome@120 10/10 ok   10/10 ok   10/10 ok   9/10 FAIL       .chrome-ranger/runs.jsonl
 chrome@121 10/10 ok   10/10 ok   10/10 ok   10/10 ok
 chrome@122 10/10 ok   10/10 ok   10/10 ok   10/10 ok        run --refs feature/virtual-list
 chrome@123 10/10 ok   10/10 ok   9/10 FAIL  10/10 ok         to retry failed cells
===
```

The completion state replaces the worker sidebar with summary information and a suggested retry command for the user.

### Tradeoffs

- **Pros:** Extremely compact header. Workers and matrix share the same vertical space. Works at 100 columns for the standard matrix.
- **Cons:** At 100 columns, the large matrix (6x4) is tight -- the worker task descriptions may need truncation. The side-by-side layout means the matrix cannot grow wider without pushing workers off-screen. No box drawing means the boundary between matrix and workers is purely spatial (relies on consistent alignment).

---

## Variation 2: Stacked Header with Box-Drawn Sections

The header is split into two distinct sections: a compact matrix table (box-drawn), then a worker status block below it. Sections are clearly separated. The header is taller but more readable.

**Design principles:**
- Box-drawing characters for the matrix border create a clear visual anchor
- Worker lines are below the matrix, each on its own line with a spinner
- The matrix cells use a mini progress bar (3 chars) plus a fraction
- Header height = 2 (top border + progress) + matrix rows + 1 (bottom border) + worker count + 1 (separator)

### Standard Matrix (3x3, workers: 4)

**State: Early run -- 6/45 done**

```
+-----------+----------+----------+----------+
| 6/45  13% |   main   |  v4.5.0  | v5.0.0-b |
+-----------+----------+----------+----------+
| chrome@120|  ##- 2/5 |  ##- 2/5 |  --- 0/5 |
| chrome@121|  ##- 2/5 |  --- 0/5 |  --- 0/5 |
| chrome@122|  --- 0/5 |  --- 0/5 |  --- 0/5 |
+-----------+----------+----------+----------+
  > W1  chrome@120 x v4.5.0 (c3d4e5f) #2               3.1s
  > W2  chrome@121 x main (e7f8a9b) #2                  1.8s
    W3  (idle)
    W4  (idle)
---
  [ 1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
  [ 2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
  [ 3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
  [ 4/45] chrome@121 x main (e7f8a9b) #1                  4198ms  exit:0
  [ 5/45] chrome@120 x v4.5.0 (c3d4e5f) #0                3891ms  exit:0
  [ 6/45] chrome@120 x v4.5.0 (c3d4e5f) #1                3744ms  exit:0
```

Header height: 11 lines (5 for the table, 4 for workers, 1 blank, 1 separator). The mini progress bar in each cell uses `#` for complete iterations and `-` for remaining. This is intentionally ASCII-only inside the table for maximum terminal compatibility.

**State: Mid-run -- 28/45, 1 failure**

```
+-----------+----------+----------+----------+
| 28/45 62% |   main   |  v4.5.0  | v5.0.0-b |  1 failed
+-----------+----------+----------+----------+
| chrome@120| ##### 5/5| ##### 5/5| ####! 4/5|
| chrome@121| ##### 5/5| ###-- 3/5| #---- 1/5|
| chrome@122| ####- 4/5| ----- 0/5| #---- 1/5|
+-----------+----------+----------+----------+
  > W1  chrome@121 x v4.5.0 (c3d4e5f) #3               2.4s
  > W2  chrome@121 x v5.0.0-b (f9a0b1c) #1             4.1s
  > W3  chrome@122 x main (e7f8a9b) #4                  0.6s
  > W4  chrome@122 x v5.0.0-b (f9a0b1c) #1             3.2s
---
  [25/45] chrome@122 x main (e7f8a9b) #2                  4301ms  exit:0
  [26/45] chrome@121 x v4.5.0 (c3d4e5f) #2                3402ms  exit:0
  [27/45] chrome@122 x main (e7f8a9b) #3                  4102ms  exit:0
  [28/45] chrome@121 x v5.0.0-b (f9a0b1c) #0              2102ms  exit:0
```

The `!` in the mini bar marks the position of a failed iteration within the cell (e.g., `####!` means 4 passed, 1 failed). Complete cells with all passes show `##### 5/5` (rendered green). Cells with failures show the `!` in red.

**State: Complete -- 45/45, 2 failures**

```
+-----------+----------+----------+----------+
| 45/45     |   main   |  v4.5.0  | v5.0.0-b |  3m 22s  2 failed
+-----------+----------+----------+----------+
| chrome@120| ##### 5/5| ##### 5/5| ####! 4/5|
| chrome@121| ##### 5/5| ##### 5/5| ##### 5/5|
| chrome@122| ##### 5/5| ##### 5/5| ####! 4/5|
+-----------+----------+----------+----------+

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
Run `chrome-ranger status --failures` for details.
===
```

On completion, the worker lines disappear entirely. The table remains as a final snapshot. Below the table, a summary line replaces the workers block. The scroll region is released.

### Large Matrix (6x4, workers: 6)

**State: Early run -- 18/240 done**

```
+-----------+------------+----------+----------+----------+
|  18/240 8%|    main    |  v4.5.0  | v5.0.0-b | feat/vl  |
+-----------+------------+----------+----------+----------+
| chrome@118| ####-- 4/10| ###--- 3/10| ------ 0/10| ------ 0/10|
| chrome@119| #####- 5/10| ##---- 2/10| ------ 0/10| ------ 0/10|
| chrome@120| ###--- 3/10| ------ 0/10| ------ 0/10| ------ 0/10|
| chrome@121| ------ 0/10| ------ 0/10| ------ 0/10| ------ 0/10|
| chrome@122| ------ 0/10| ------ 0/10| ------ 0/10| ------ 0/10|
| chrome@123| ------ 0/10| ------ 0/10| ------ 0/10| ------ 0/10|
+-----------+------------+----------+----------+----------+
  > W1  chrome@119 x main #2                             2.1s
  > W2  chrome@118 x v4.5.0 #3                           3.8s
  > W3  chrome@119 x v4.5.0 #2                           1.4s
  > W4  chrome@120 x main #3                              0.9s
  > W5  chrome@118 x v5.0.0-b #0                         4.5s
  > W6  chrome@118 x feat/vl #0                          2.2s
---
  [15/240] chrome@120 x main (e7f8a9b) #0                 4523ms  exit:0
  [16/240] chrome@118 x v4.5.0 (c3d4e5f) #2               3802ms  exit:0
  [17/240] chrome@119 x v4.5.0 (c3d4e5f) #0               3688ms  exit:0
  [18/240] chrome@120 x main (e7f8a9b) #1                 4210ms  exit:0
```

Header height: 15 lines (8 for the table, 6 for workers, 1 separator). This is tall -- on an 80-row terminal, 15 lines for the header leaves 65 lines for scrolling log, which is fine. On a 24-row terminal this is too much; see "small terminal" note below.

**State: Mid-run -- 142/240, 3 failures**

```
+-----------+------------+----------+----------+----------+
| 142/240   |    main    |  v4.5.0  | v5.0.0-b | feat/vl  |  3 failed
+-----------+------------+----------+----------+----------+
| chrome@118| ########## | ########## | ########## | ########!! |
|           |      10/10 |      10/10 |      10/10 |   8/10     |
| chrome@119| ########## | ########## | ########## | ########## |
|           |      10/10 |      10/10 |      10/10 |      10/10 |
| chrome@120| ########## | ########## | ########-- | #####----- |
|           |      10/10 |      10/10 |       8/10 |       5/10 |
| chrome@121| ########## | #######--- | ####------ | ##-------- |
|           |      10/10 |       7/10 |       4/10 |       2/10 |
| chrome@122| ###------- | #--------- | ---------- | ---------- |
|           |       3/10 |       1/10 |       0/10 |       0/10 |
| chrome@123| ---------- | ---------- | ---------- | ---------- |
|           |       0/10 |       0/10 |       0/10 |       0/10 |
+-----------+------------+----------+----------+----------+
```

Wait -- that two-line-per-row approach is getting too tall. Let me correct: for the large matrix we should keep cells single-line but use a shorter bar (6 chars for 10 iterations, each char = ~2 iterations).

**State: Mid-run -- 142/240, 3 failures (corrected)**

```
+-----------+-----------+-----------+-----------+-----------+
| 142/240   |   main    |  v4.5.0   | v5.0.0-b  |  feat/vl  |  3 failed
+-----------+-----------+-----------+-----------+-----------+
| chrome@118| ##### 10/10| ##### 10/10| ##### 10/10| ####! 8/10|
| chrome@119| ##### 10/10| ##### 10/10| ##### 10/10| ##### 10/10|
| chrome@120| ##### 10/10| ##### 10/10| ####-  8/10| ###-- 5/10|
| chrome@121| ##### 10/10| ####-  7/10| ##--- 4/10| #---- 2/10|
| chrome@122| ##--- 3/10| #----  1/10| ----- 0/10| ----- 0/10|
| chrome@123| ----- 0/10| -----  0/10| ----- 0/10| ----- 0/10|
+-----------+-----------+-----------+-----------+-----------+
  > W1  chrome@121 x v5.0.0-b #4                        1.2s
  > W2  chrome@122 x main #3                             3.6s
  > W3  chrome@121 x feat/vl #6                          2.8s
  > W4  chrome@122 x v4.5.0 #1                           0.4s
  > W5  chrome@120 x feat/vl #7                          4.1s
  > W6  chrome@120 x v5.0.0-b #9                        1.7s
---
  [139/240] chrome@120 x v5.0.0-b (f9a0b1c) #7            2301ms  exit:0
  [140/240] chrome@118 x feat/vl (a1b2c3d) #8             2891ms  exit:1  FAIL
  [141/240] chrome@121 x v4.5.0 (c3d4e5f) #6              3402ms  exit:0
  [142/240] chrome@120 x v5.0.0-b (f9a0b1c) #8            2189ms  exit:0
```

The mini bars scale: 5 chars for 5 iterations (1:1), 5 chars for 10 iterations (1:2, rounded). The exact mapping is `Math.round(passed * barWidth / total)`.

**State: Complete -- 240/240, 5 failures**

```
+-----------+-----------+-----------+-----------+-----------+
| 240/240   |   main    |  v4.5.0   | v5.0.0-b  |  feat/vl  |  16m 08s
+-----------+-----------+-----------+-----------+-----------+
| chrome@118| ##### 10/10| ##### 10/10| ##### 10/10| ####! 9/10|
| chrome@119| ##### 10/10| ##### 10/10| ##### 10/10| ##### 10/10|
| chrome@120| ##### 10/10| ##### 10/10| ##### 10/10| ####! 9/10|
| chrome@121| ##### 10/10| ##### 10/10| ##### 10/10| ##### 10/10|
| chrome@122| ##### 10/10| ##### 10/10| ##### 10/10| ##### 10/10|
| chrome@123| ##### 10/10| ##### 10/10| ####! 9/10| ##### 10/10|
+-----------+-----------+-----------+-----------+-----------+

Done. 240 runs in 16m 08s (5 failed across 3 cells)
Run `chrome-ranger status --failures` for details.
===
```

### Tradeoffs

- **Pros:** Box drawing creates a strong visual anchor; clear separation between matrix and workers; the mini-bar in each cell gives progress shape per cell; ASCII `+-|` is universally supported (no Unicode box-drawing needed).
- **Cons:** Tallest header of the three variations (table borders + worker lines). The large matrix header is 15 lines before the separator. The box characters add visual noise if you stare at the table for minutes.

---

## Variation 3: Compact Bar Header with Inline Workers

The most minimal header: just a progress line and worker lines. No matrix in the header at all during the run. Instead, the scrolling log IS the matrix visibility -- but failures and cell completion are called out as special log entries. On completion, the matrix materializes as the final summary.

Wait -- the brief says "must have a pinned/fixed header area" with the matrix. Let me revise: this variation puts the matrix in the header, but as a *single compressed line* per Chrome version using sparkline-style fill characters rather than a table.

**Design principles:**
- One line per Chrome version, each containing ref progress as compact blocks
- Workers are inline in the header, each on one line
- The header is as short as possible: 1 (progress) + chrome_count (matrix) + 1 (blank) + worker_count + 1 (separator)
- No borders or box drawing at all
- Heavy use of Unicode block characters for density

The matrix line format is:
```
 chrome@120  main [====>    ] v4.5.0 [===>     ] v5.0.0 [         ]
```

Each ref gets a 9-char bar that fills left-to-right. The bar uses `=` for passed, `!` for failed, `>` for the current leading edge, and spaces for remaining.

### Standard Matrix (3x3, workers: 4)

**State: Early run -- 6/45 done**

```
 6/45  13%  ============>                                          0:41

 chrome@120  main [==>      ] v4.5.0 [==>      ] v5.0.0-b [         ]
 chrome@121  main [==>      ] v4.5.0 [         ] v5.0.0-b [         ]
 chrome@122  main [         ] v4.5.0 [         ] v5.0.0-b [         ]

 W1 chrome@120 x v4.5.0 #2         3.1s    W3 (idle)
 W2 chrome@121 x main #2           1.8s    W4 (idle)
---
  [ 1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
  [ 2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
  [ 3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
  [ 4/45] chrome@121 x main (e7f8a9b) #1                  4198ms  exit:0
  [ 5/45] chrome@120 x v4.5.0 (c3d4e5f) #0                3891ms  exit:0
  [ 6/45] chrome@120 x v4.5.0 (c3d4e5f) #1                3744ms  exit:0
```

Header height: 8 lines (progress, blank, 3 chrome rows, blank, 2 worker rows packed 2-per-line, separator). Workers are packed two per line to save height.

The bars are 9 characters wide. For 5 iterations, each iteration is roughly 2 characters of fill. `==>` means "2 done, working on next". An empty `[         ]` means "not started".

**State: Mid-run -- 28/45, 1 failure**

```
 28/45  62%  ======================================>               2:14  1 failed

 chrome@120  main [=========] v4.5.0 [=========] v5.0.0-b [=====!>> ]
 chrome@121  main [=========] v4.5.0 [=====>   ] v5.0.0-b [=>       ]
 chrome@122  main [======>  ] v4.5.0 [         ] v5.0.0-b [=>       ]

 W1 chrome@121 x v4.5.0 #3         2.4s    W3 chrome@122 x main #4          0.6s
 W2 chrome@121 x v5.0.0-b #1       4.1s    W4 chrome@122 x v5.0.0-b #1     3.2s
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

The `!` in the bar for `chrome@120 x v5.0.0-b` marks a failure at that position in the bar. Completed cells show `[=========]` (all green). The `>` shows the advancing edge.

**State: Complete -- 45/45, 2 failures**

On completion, the header transforms into a clean summary with the matrix still visible:

```
 45/45  100%  ======================================================  3m 22s

 chrome@120  main [=========] v4.5.0 [=========] v5.0.0-b [====!=====] 4/5
 chrome@121  main [=========] v4.5.0 [=========] v5.0.0-b [=========]
 chrome@122  main [=========] v4.5.0 [=========] v5.0.0-b [====!=====] 4/5

 45 runs complete, 2 failed. Logged to .chrome-ranger/runs.jsonl
===
```

Cells with all iterations passed show a clean bar and no fraction (implicit: all good). Cells with failures show the bar with `!` markers and append the pass/total fraction. Workers disappear.

### Large Matrix (6x4, workers: 6)

**State: Early run -- 18/240 done**

```
 18/240   8%  ====>                                                  1:12

 chrome@118  main [====>    ] v4.5.0 [==>      ] v5.0.0-b [         ] feat/vl [         ]
 chrome@119  main [=====>   ] v4.5.0 [=>       ] v5.0.0-b [         ] feat/vl [         ]
 chrome@120  main [==>      ] v4.5.0 [         ] v5.0.0-b [         ] feat/vl [         ]
 chrome@121  main [         ] v4.5.0 [         ] v5.0.0-b [         ] feat/vl [         ]
 chrome@122  main [         ] v4.5.0 [         ] v5.0.0-b [         ] feat/vl [         ]
 chrome@123  main [         ] v4.5.0 [         ] v5.0.0-b [         ] feat/vl [         ]

 W1 chrome@119 x main #2        2.1s    W4 chrome@120 x main #3       0.9s
 W2 chrome@118 x v4.5.0 #3      3.8s    W5 chrome@118 x v5.0.0-b #0  4.5s
 W3 chrome@119 x v4.5.0 #2      1.4s    W6 chrome@118 x feat/vl #0   2.2s
---
  [15/240] chrome@120 x main (e7f8a9b) #0                 4523ms  exit:0
  [16/240] chrome@118 x v4.5.0 (c3d4e5f) #2               3802ms  exit:0
  [17/240] chrome@119 x v4.5.0 (c3d4e5f) #0               3688ms  exit:0
  [18/240] chrome@120 x main (e7f8a9b) #1                 4210ms  exit:0
```

Header height: 12 lines (progress, blank, 6 chrome rows, blank, 3 packed worker rows, separator). This is compact despite the 6x4 matrix. Each matrix line is long (~95 chars with 4 refs) but fits in 100 columns if ref names are short. At 120 columns it is comfortable.

Width concern: `" chrome@118  main [====>    ] v4.5.0 [==>      ] v5.0.0-b [         ] feat/vl [         ]"` is 93 characters. Fits 100 columns.

**State: Mid-run -- 142/240, 3 failures**

```
 142/240  59%  ====================================>                   9:48  3 failed

 chrome@118  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [======!> ] 8/10
 chrome@119  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=========]
 chrome@120  main [=========] v4.5.0 [=========] v5.0.0-b [======>  ] feat/vl [====>    ]
 chrome@121  main [=========] v4.5.0 [======>  ] v5.0.0-b [===>     ] feat/vl [=>       ]
 chrome@122  main [==>      ] v4.5.0 [>        ] v5.0.0-b [         ] feat/vl [         ]
 chrome@123  main [         ] v4.5.0 [         ] v5.0.0-b [         ] feat/vl [         ]

 W1 chrome@121 x v5.0.0-b #4   1.2s    W4 chrome@122 x v4.5.0 #1    0.4s
 W2 chrome@122 x main #3        3.6s    W5 chrome@120 x feat/vl #7   4.1s
 W3 chrome@121 x feat/vl #6    2.8s    W6 chrome@120 x v5.0.0-b #9  1.7s
---
  [139/240] chrome@120 x v5.0.0-b (f9a0b1c) #7            2301ms  exit:0
  [140/240] chrome@118 x feat/vl (a1b2c3d) #8             2891ms  exit:1  FAIL
  [141/240] chrome@121 x v4.5.0 (c3d4e5f) #6              3402ms  exit:0
  [142/240] chrome@120 x v5.0.0-b (f9a0b1c) #8            2189ms  exit:0
```

**State: Complete -- 240/240, 5 failures**

```
 240/240  100%  ======================================================  16m 08s

 chrome@118  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=======!!] 8/10
 chrome@119  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=========]
 chrome@120  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=======!!] 8/10
 chrome@121  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=========]
 chrome@122  main [=========] v4.5.0 [=========] v5.0.0-b [=========] feat/vl [=========]
 chrome@123  main [=========] v4.5.0 [=========] v5.0.0-b [====!====] feat/vl [=========] 9/10

 240 runs complete, 5 failed across 3 cells. Logged to .chrome-ranger/runs.jsonl
 Run `chrome-ranger run --refs feature/virtual-list` to retry.
===
```

### Tradeoffs

- **Pros:** Shortest header height of all three variations. No box drawing (pure ASCII). The inline bar per ref gives per-cell progress without needing column alignment. Workers packed 2-per-line saves space. Scales well to large matrices because each additional Chrome version is just one more line.
- **Cons:** Lines get long with many refs -- 4 refs at 100 columns is tight and 5+ refs would overflow. The `[====>    ]` bar syntax is less information-dense than a numeric fraction (you cannot see "7/10" at a glance, only the approximate fill). The horizontal layout makes column alignment across Chrome rows important for scannability but hard to guarantee with varying ref name lengths.

---

## Special Views

These views are not part of the live run display. They are invoked after a run completes, or at any time against the existing `runs.jsonl`.

### `--failures` View

Invoked as `chrome-ranger status --failures` or after a run completes with failures, offered as a suggested next command.

This view filters to only failed iterations and groups them by cell, showing the stderr tail for each. It is not a pinned-header view -- it is standard scrolling output.

**After a run with 5 failures across 3 cells:**

```
$ chrome-ranger status --failures

3 cells with failures (5 failed iterations total)

chrome@118 x feature/virtual-list (a1b2c3d)  ----  2 of 10 failed

  Iteration #6  exit:1  2891ms  2026-02-18T10:38:12Z
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/a1b2c3d4-e5f6-7890-abcd-ef1234567890.stderr

  Iteration #8  exit:1  3102ms  2026-02-18T10:39:44Z
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/b2c3d4e5-f6a7-8901-bcde-f12345678901.stderr

chrome@120 x feature/virtual-list (a1b2c3d)  ----  2 of 10 failed

  Iteration #3  exit:1  2455ms  2026-02-18T10:35:21Z
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/c3d4e5f6-a7b8-9012-cdef-123456789012.stderr

  Iteration #7  exit:1  2710ms  2026-02-18T10:38:55Z
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/d4e5f6a7-b8c9-0123-defa-234567890123.stderr

chrome@123 x v5.0.0-beta.1 (f9a0b1c)  ----  1 of 10 failed

  Iteration #4  exit:2  1823ms  2026-02-18T10:41:03Z
  stderr (last 3 lines):
    ENOENT: no such file or directory, open '/tmp/bench-result.json'
        at Object.openSync (node:fs:603:3)
  output: .chrome-ranger/output/e5f6a7b8-c9d0-1234-efab-345678901234.stderr

Suggested fix:
  chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
```

**Design notes for `--failures`:**
- Groups by cell (chrome x ref), not by individual iteration
- Shows the stderr tail (last 3 lines by default, configurable with `--lines N`)
- Always includes the full path to the stderr output file so the user can `cat` it
- At the bottom, suggests a `chrome-ranger run` command scoped to only the affected refs
- If there are no failures: `No failed iterations.`
- Exit codes are shown because different exit codes may indicate different failure modes

**Variant: `--failures --verbose`**

Shows the full stderr instead of just the tail:

```
  Iteration #6  exit:1  2891ms  2026-02-18T10:38:12Z
  stderr:
    Running 1 test using 1 worker

    tests/bench.spec.ts:3:5 - render 1000 rows

    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

    1 failed
    1 test total
```

### `--json` View

Invoked as `chrome-ranger status --json`. Outputs a single JSON object to stdout (not stderr -- this is the one exception to the "all output to stderr" rule, because `--json` is explicitly for piping).

**Full output:**

```json
{
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
      {"ref": "main", "sha": "e7f8a9b"},
      {"ref": "v4.5.0", "sha": "c3d4e5f"},
      {"ref": "v5.0.0-beta.1", "sha": "f9a0b1c"},
      {"ref": "feature/virtual-list", "sha": "a1b2c3d"}
    ]
  },
  "cells": [
    {
      "chrome": "118.0.5993.70",
      "ref": "main",
      "sha": "e7f8a9b",
      "target": 10,
      "passed": 10,
      "failed": 0,
      "runs": [
        {"id": "abc123", "iteration": 0, "durationMs": 4523, "exitCode": 0, "timestamp": "2026-02-18T10:30:00Z"},
        {"id": "def456", "iteration": 1, "durationMs": 4210, "exitCode": 0, "timestamp": "2026-02-18T10:30:05Z"}
      ]
    },
    {
      "chrome": "118.0.5993.70",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "target": 10,
      "passed": 8,
      "failed": 2,
      "runs": [
        {"id": "ghi789", "iteration": 0, "durationMs": 2301, "exitCode": 0, "timestamp": "2026-02-18T10:35:00Z"},
        {"id": "jkl012", "iteration": 6, "durationMs": 2891, "exitCode": 1, "timestamp": "2026-02-18T10:38:12Z"},
        {"id": "mno345", "iteration": 8, "durationMs": 3102, "exitCode": 1, "timestamp": "2026-02-18T10:39:44Z"}
      ]
    }
  ],
  "summary": {
    "totalCells": 24,
    "totalRuns": 240,
    "passed": 235,
    "failed": 5,
    "remaining": 0,
    "cellsWithFailures": 3,
    "wallTime": "16m 08s",
    "wallTimeMs": 968000
  }
}
```

**Design notes for `--json`:**
- The `cells` array is the full cross-product, even for cells with 0 runs (those have `"runs": []`)
- Each cell includes its individual `runs` array with every iteration (passed and failed)
- The `runs` array within each cell is ordered by iteration number
- `summary.remaining` counts iterations that still need a successful run to reach `target`
- The `config` block includes the relevant fields from `chrome-ranger.yaml` so the JSON is self-describing
- Output goes to stdout (not stderr) so it can be piped directly to `jq`, a file, or another tool
- When combined with `--failures`, only cells with failures are included in the `cells` array:

```
$ chrome-ranger status --json --failures | jq '.cells | length'
3
```

**Usage examples:**

```bash
# Get all failed run IDs for further investigation
chrome-ranger status --json | jq '[.cells[].runs[] | select(.exitCode != 0) | .id]'

# Average duration per cell
chrome-ranger status --json | jq '.cells[] | {cell: "\(.chrome) x \(.ref)", avg: ([.runs[] | select(.exitCode == 0) | .durationMs] | add / length)}'

# Export to CSV for spreadsheet analysis
chrome-ranger status --json | jq -r '.cells[] | .runs[] | [.chrome, .ref, .iteration, .durationMs, .exitCode] | @csv'
```

---

## Comparison Summary

| Aspect                     | Variation 1 (Dense + Sidebar) | Variation 2 (Box Table + Stacked) | Variation 3 (Compact Bars) |
|----------------------------|-------------------------------|-----------------------------------|----------------------------|
| Header height (3x3, w:4)  | 5 lines                       | 11 lines                          | 8 lines                    |
| Header height (6x4, w:6)  | 8 lines                       | 15 lines                          | 12 lines                   |
| Min terminal width (3x3)  | ~95 cols                      | ~75 cols                          | ~93 cols                   |
| Min terminal width (6x4)  | ~105 cols                     | ~85 cols                          | ~95 cols                   |
| Per-cell count visible     | Yes (fraction)                | Yes (fraction + mini bar)         | Approximate (bar fill)     |
| Failure location in cell   | Cell-level flag               | Position in mini bar              | Position in bar            |
| Worker visibility          | Sidebar (shares matrix rows)  | Below matrix (own section)        | Below matrix (packed 2/line)|
| Box drawing                | No                            | ASCII `+-\|`                      | No                         |
| Visual complexity          | Medium                        | High                              | Low-medium                 |
| Implementation complexity  | Medium                        | Medium-high                       | Medium                     |

### Recommendation

**Variation 3 (Compact Bars)** for the default live display. Reasons:

1. **Shortest header** for the standard case (8 lines vs 11), leaving maximum space for the scrolling log where the real action is.
2. **Inline bars per ref** are the most natural fit for a terminal -- you read left to right across a Chrome version row and immediately see which refs are ahead/behind.
3. **Worker packing** (2 per line) keeps the header compact even with 6+ workers.
4. **No box drawing** means fewer edge cases in terminal rendering and simpler implementation.
5. **Width scales well** -- each additional ref adds ~22 characters (ref name + bar). Four refs fit comfortably at 100 columns.

The tradeoff is that exact counts are less visible (you see bar fill, not "7/10"). Mitigate this by showing the fraction next to any bar that has failures (since those are the cells you care about), and on the completion state, show fractions for all non-perfect cells.

**Variation 2 (Box Table)** is the best choice if the user values a structured, spreadsheet-like matrix where exact counts are always visible. Its taller header is acceptable on modern terminals (30+ rows typical).

**Variation 1 (Dense + Sidebar)** is the most compact but hardest to read at a glance because the matrix and workers compete for the same horizontal space. Best for users who prioritize minimizing header height above all else.

### Small Terminal Handling

If the terminal has fewer than 30 rows, all variations should degrade:
1. First, hide the matrix -- show only the progress line, worker lines, and separator.
2. If still too tall, hide idle workers (only show active ones).
3. If the terminal is under 10 rows, fall back to Option B (single progress bar, no header).

The threshold check happens once at startup and on `SIGWINCH` (terminal resize).
