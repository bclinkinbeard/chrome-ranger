# Special Views: `status`, `--failures`, and `--json`

Detailed variations for post-run status output. These complement the live-run display (Options A/D — matrix grid with scrolling log). All examples use realistic data from the DESIGN.md project example unless otherwise noted.

**Standard matrix used in most examples** (from STATUS-VISUALIZATIONS.md):

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

3x3 matrix = 9 cells, 5 iterations each = 45 total runs.

**Large matrix used in scaling examples** (6x4):

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
```

6x4 matrix = 24 cells, 10 iterations each = 240 total runs.

---

## 1. `status` (Default Post-Run View)

The command users run after `chrome-ranger run` finishes, or anytime to check the state of the matrix. Must feel like a natural companion to the live-run matrix grid from Options A/D.

---

### Variation 1A: Unified Grid with Bars and Summary Footer

Matches the live-run matrix aesthetic directly — same column layout, same Chrome/ref axes — but replaces the progress bars with completion bars and adds a summary footer. The grid IS the status. No extra decoration.

**Empty (no runs yet):**

```
$ chrome-ranger status

chrome-ranger status — 0/45 iterations

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ░░░░░ 0/5         ░░░░░ 0/5           ░░░░░ 0/5
Chrome 121       ░░░░░ 0/5         ░░░░░ 0/5           ░░░░░ 0/5
Chrome 122       ░░░░░ 0/5         ░░░░░ 0/5           ░░░░░ 0/5

No runs recorded. Run `chrome-ranger run` to start.
```

**Partial (mid-run, or interrupted):**

```
$ chrome-ranger status

chrome-ranger status — 28/45 iterations (62%)

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       █████ 5/5 ok      █████ 5/5 ok        ████░ 4/5 1 fail
Chrome 121       █████ 5/5 ok      ███░░ 3/5           █░░░░ 1/5
Chrome 122       ████░ 4/5         ░░░░░ 0/5           █░░░░ 1/5

17 remaining. Resume with `chrome-ranger run`.
```

**Complete (all pass):**

```
$ chrome-ranger status

chrome-ranger status — 45/45 iterations

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       █████ 5/5 ok      █████ 5/5 ok        █████ 5/5 ok
Chrome 121       █████ 5/5 ok      █████ 5/5 ok        █████ 5/5 ok
Chrome 122       █████ 5/5 ok      █████ 5/5 ok        █████ 5/5 ok

All cells complete. 45 runs, 0 failures.
```

**Mixed failures:**

```
$ chrome-ranger status

chrome-ranger status — 45/45 iterations (2 failed)

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       █████ 5/5 ok      █████ 5/5 ok        ████░ 4/5 1 fail
Chrome 121       █████ 5/5 ok      █████ 5/5 ok        █████ 5/5 ok
Chrome 122       █████ 5/5 ok      █████ 5/5 ok        ████░ 4/5 1 fail

43/45 passed, 2 failed. See `chrome-ranger status --failures` for details.
```

**After --append (cells with >target runs):**

```
$ chrome-ranger status

chrome-ranger status — 51/45 iterations

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ████████ 8/5 ok   █████ 5/5 ok        █████ 5/5 ok
Chrome 121       █████ 5/5 ok      █████ 5/5 ok        ████████ 8/5 ok
Chrome 122       █████ 5/5 ok      █████ 5/5 ok        █████ 5/5 ok

All cells complete. 51 runs, 0 failures.
```

**Large matrix (6x4):**

```
$ chrome-ranger status

chrome-ranger status — 187/240 iterations (78%)

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   v5.0.0-beta.1 (f1a2b3c)   feature/virtual-list (a1b2c3d)
Chrome 118       ██████████ 10/10   ██████████ 10/10    ██████████ 10/10           ██████████ 10/10
Chrome 119       ██████████ 10/10   ██████████ 10/10    ██████████ 10/10           ████████░░  8/10 2 fail
Chrome 120       ██████████ 10/10   ██████████ 10/10    ████████░░  8/10           ██████░░░░  6/10
Chrome 121       ██████████ 10/10   ████████░░  8/10    ██████░░░░  6/10           ████░░░░░░  4/10
Chrome 122       ████████░░  8/10   ████░░░░░░  4/10    ██░░░░░░░░  2/10           ░░░░░░░░░░  0/10
Chrome 123       ████░░░░░░  4/10   █░░░░░░░░░  1/10    ░░░░░░░░░░  0/10           ░░░░░░░░░░  0/10

53 remaining, 2 failed. Resume with `chrome-ranger run`.
```

**Pros:** Immediately recognizable as "the same grid" from the live run. The header line echoes the live-run header. Zero learning curve if you saw the run happen. Summary footer is actionable — tells you what to do next.

**Cons:** The bars add horizontal width. At 6x4, it gets wide. The `ok`/`fail` labels take space that just `checkmark`/`x` would not.

---

### Variation 1B: Tight Matrix with Color-Coded Symbols

Drops the bars entirely. Uses the same matrix layout but each cell is just a count and a symbol. More compact, scales better. Relies on terminal color (with monochrome fallback via symbols) to communicate state.

Symbols: `ok` = complete with all pass, `--` = not started, `..` = in progress, `FAIL` = has failures.

**Empty:**

```
$ chrome-ranger status

                  main           v4.5.0         feature/virtual-list
                  (e7f8a9b)      (c3d4e5f)      (a1b2c3d)
Chrome 120       0/5  --        0/5  --         0/5  --
Chrome 121       0/5  --        0/5  --         0/5  --
Chrome 122       0/5  --        0/5  --         0/5  --

0/45 iterations. Run `chrome-ranger run` to start.
```

**Partial:**

```
$ chrome-ranger status

                  main           v4.5.0         feature/virtual-list
                  (e7f8a9b)      (c3d4e5f)      (a1b2c3d)
Chrome 120       5/5  ok        5/5  ok         4/5  FAIL
Chrome 121       5/5  ok        3/5  ..         1/5  ..
Chrome 122       4/5  ..        0/5  --         1/5  ..

28/45 iterations (62%), 1 failed.
```

**Complete:**

```
$ chrome-ranger status

                  main           v4.5.0         feature/virtual-list
                  (e7f8a9b)      (c3d4e5f)      (a1b2c3d)
Chrome 120       5/5  ok        5/5  ok         5/5  ok
Chrome 121       5/5  ok        5/5  ok         5/5  ok
Chrome 122       5/5  ok        5/5  ok         5/5  ok

45/45 iterations, all passed.
```

**Mixed failures:**

```
$ chrome-ranger status

                  main           v4.5.0         feature/virtual-list
                  (e7f8a9b)      (c3d4e5f)      (a1b2c3d)
Chrome 120       5/5  ok        5/5  ok         4/5  FAIL
Chrome 121       5/5  ok        5/5  ok         5/5  ok
Chrome 122       5/5  ok        5/5  ok         4/5  FAIL

45/45 iterations, 43 passed, 2 failed in 2 cells.
Use `chrome-ranger status --failures` for details.
```

**After --append:**

```
$ chrome-ranger status

                  main           v4.5.0         feature/virtual-list
                  (e7f8a9b)      (c3d4e5f)      (a1b2c3d)
Chrome 120       8/5  ok        5/5  ok         5/5  ok
Chrome 121       5/5  ok        5/5  ok         8/5  ok
Chrome 122       5/5  ok        5/5  ok         5/5  ok

51/45 iterations (appended), all passed.
```

**Large matrix (6x4):**

```
$ chrome-ranger status

                  main         v4.5.0       v5.0.0-beta.1  feat/virtual-list
                  (e7f8a9b)    (c3d4e5f)    (f1a2b3c)      (a1b2c3d)
Chrome 118       10/10 ok     10/10 ok     10/10 ok        10/10 ok
Chrome 119       10/10 ok     10/10 ok     10/10 ok         8/10 FAIL
Chrome 120       10/10 ok     10/10 ok      8/10 ..         6/10 ..
Chrome 121       10/10 ok      8/10 ..      6/10 ..         4/10 ..
Chrome 122        8/10 ..      4/10 ..      2/10 ..         0/10 --
Chrome 123        4/10 ..      1/10 ..      0/10 --         0/10 --

187/240 iterations (78%), 2 failed.
```

**Pros:** Very compact. Scales well to 6x4 without horizontal scrolling. Ref names on one line with SHAs on the line below keeps columns narrow. `FAIL` stands out even without color.

**Cons:** Less visual flair than bars — harder to "feel" the completion shape at a glance. The two-line header might confuse some users initially.

---

### Variation 1C: Bordered Grid with Inline Bars and Timing

A bordered table that adds per-cell min/max duration. The border gives it a "report" feel — clearly a post-run artifact, not a live display. Includes a summary section below the table.

**Empty:**

```
$ chrome-ranger status

  No runs recorded.

  ┌────────────┬─────────────────┬──────────────────┬──────────────────────────────┐
  │            │ main            │ v4.5.0           │ feature/virtual-list         │
  │            │ (e7f8a9b)       │ (c3d4e5f)        │ (a1b2c3d)                    │
  ├────────────┼─────────────────┼──────────────────┼──────────────────────────────┤
  │ Chrome 120 │ ░░░░░ 0/5      │ ░░░░░ 0/5        │ ░░░░░ 0/5                    │
  │ Chrome 121 │ ░░░░░ 0/5      │ ░░░░░ 0/5        │ ░░░░░ 0/5                    │
  │ Chrome 122 │ ░░░░░ 0/5      │ ░░░░░ 0/5        │ ░░░░░ 0/5                    │
  └────────────┴─────────────────┴──────────────────┴──────────────────────────────┘

  Run `chrome-ranger run` to start.
```

**Partial:**

```
$ chrome-ranger status

  28/45 iterations (62%), 1 failed

  ┌────────────┬───────────────────────┬───────────────────────┬───────────────────────────────────┐
  │            │ main (e7f8a9b)        │ v4.5.0 (c3d4e5f)     │ feature/virtual-list (a1b2c3d)    │
  ├────────────┼───────────────────────┼───────────────────────┼───────────────────────────────────┤
  │ Chrome 120 │ █████ 5/5  3.7-4.5s  │ █████ 5/5  3.6-4.0s  │ ████░ 4/5  2.1-2.5s  1 fail      │
  │ Chrome 121 │ █████ 5/5  4.0-4.3s  │ ███░░ 3/5  3.2-3.4s  │ █░░░░ 1/5  2.1s                   │
  │ Chrome 122 │ ████░ 4/5  4.1-4.3s  │ ░░░░░ 0/5            │ █░░░░ 1/5  2.3s                   │
  └────────────┴───────────────────────┴───────────────────────┴───────────────────────────────────┘

  17 remaining. Resume with `chrome-ranger run`.
```

**Complete:**

```
$ chrome-ranger status

  45/45 iterations, all passed

  ┌────────────┬───────────────────────┬───────────────────────┬───────────────────────────────────┐
  │            │ main (e7f8a9b)        │ v4.5.0 (c3d4e5f)     │ feature/virtual-list (a1b2c3d)    │
  ├────────────┼───────────────────────┼───────────────────────┼───────────────────────────────────┤
  │ Chrome 120 │ █████ 5/5  3.7-4.5s  │ █████ 5/5  3.6-4.0s  │ █████ 5/5  2.1-2.5s               │
  │ Chrome 121 │ █████ 5/5  4.0-4.3s  │ █████ 5/5  3.2-3.4s  │ █████ 5/5  2.1-2.3s               │
  │ Chrome 122 │ █████ 5/5  4.1-4.3s  │ █████ 5/5  3.6-3.8s  │ █████ 5/5  2.1-2.3s               │
  └────────────┴───────────────────────┴───────────────────────┴───────────────────────────────────┘
```

**Mixed failures:**

```
$ chrome-ranger status

  45/45 iterations, 43 passed, 2 failed

  ┌────────────┬───────────────────────┬───────────────────────┬───────────────────────────────────┐
  │            │ main (e7f8a9b)        │ v4.5.0 (c3d4e5f)     │ feature/virtual-list (a1b2c3d)    │
  ├────────────┼───────────────────────┼───────────────────────┼───────────────────────────────────┤
  │ Chrome 120 │ █████ 5/5  3.7-4.5s  │ █████ 5/5  3.6-4.0s  │ ████░ 4/5  2.1-2.5s  1 fail      │
  │ Chrome 121 │ █████ 5/5  4.0-4.3s  │ █████ 5/5  3.2-3.4s  │ █████ 5/5  2.1-2.3s               │
  │ Chrome 122 │ █████ 5/5  4.1-4.3s  │ █████ 5/5  3.6-3.8s  │ ████░ 4/5  2.1-2.3s  1 fail      │
  └────────────┴───────────────────────┴───────────────────────┴───────────────────────────────────┘

  Use `chrome-ranger status --failures` for failure details.
```

**After --append:**

```
$ chrome-ranger status

  51/45 iterations (6 appended), all passed

  ┌────────────┬───────────────────────┬───────────────────────┬───────────────────────────────────┐
  │            │ main (e7f8a9b)        │ v4.5.0 (c3d4e5f)     │ feature/virtual-list (a1b2c3d)    │
  ├────────────┼───────────────────────┼───────────────────────┼───────────────────────────────────┤
  │ Chrome 120 │ ████████ 8/5  3.5-4.5s│ █████ 5/5  3.6-4.0s │ █████ 5/5  2.1-2.5s               │
  │ Chrome 121 │ █████ 5/5  4.0-4.3s  │ █████ 5/5  3.2-3.4s  │ ████████ 8/5  2.0-2.4s            │
  │ Chrome 122 │ █████ 5/5  4.1-4.3s  │ █████ 5/5  3.6-3.8s  │ █████ 5/5  2.1-2.3s               │
  └────────────┴───────────────────────┴───────────────────────┴───────────────────────────────────┘
```

**Large matrix (6x4):**

```
$ chrome-ranger status

  187/240 iterations (78%), 2 failed

  ┌────────────┬─────────────────────┬─────────────────────┬─────────────────────┬─────────────────────┐
  │            │ main (e7f8a9b)      │ v4.5.0 (c3d4e5f)   │ v5-beta.1 (f1a2b3c) │ feat/vl (a1b2c3d)   │
  ├────────────┼─────────────────────┼─────────────────────┼─────────────────────┼─────────────────────┤
  │ Chrome 118 │ ██████████ 10/10    │ ██████████ 10/10    │ ██████████ 10/10    │ ██████████ 10/10    │
  │ Chrome 119 │ ██████████ 10/10    │ ██████████ 10/10    │ ██████████ 10/10    │ ████████░░  8/10  2f│
  │ Chrome 120 │ ██████████ 10/10    │ ██████████ 10/10    │ ████████░░  8/10    │ ██████░░░░  6/10    │
  │ Chrome 121 │ ██████████ 10/10    │ ████████░░  8/10    │ ██████░░░░  6/10    │ ████░░░░░░  4/10    │
  │ Chrome 122 │ ████████░░  8/10    │ ████░░░░░░  4/10    │ ██░░░░░░░░  2/10    │ ░░░░░░░░░░  0/10    │
  │ Chrome 123 │ ████░░░░░░  4/10    │ █░░░░░░░░░  1/10    │ ░░░░░░░░░░  0/10    │ ░░░░░░░░░░  0/10    │
  └────────────┴─────────────────────┴─────────────────────┴─────────────────────┴─────────────────────┘

  53 remaining, 2 failed. Resume with `chrome-ranger run`.
```

**Pros:** Borders create a clean visual frame. Duration ranges give immediate benchmark value without needing `--json` or separate analysis. Feels like a proper artifact. Scales acceptably to 6x4 with ref name truncation.

**Cons:** Widest of the three variations. Box-drawing characters can misrender in some terminals. Duration data may feel like scope creep for a "status" command (though benchmarking IS the primary use case).

---

### Status Variation Comparison

| Aspect | 1A (Bars + Footer) | 1B (Tight Symbols) | 1C (Bordered + Timing) |
|---|---|---|---|
| Width at 3x3 | ~85 cols | ~70 cols | ~105 cols |
| Width at 6x4 | ~110 cols | ~80 cols | ~105 cols (truncated refs) |
| Visual continuity with live-run | High (same bars) | Medium (same layout) | Medium (different frame) |
| Information density | Medium | Low | High |
| Benchmark-friendly | No | No | Yes (duration ranges) |
| Pipe-safe | Yes | Yes | Mostly (box chars) |

---

## 2. `status --failures`

Focused failure report. Should be immediately actionable — the user should know what failed, why, and what to do about it within 5 seconds of reading the output.

---

### Variation 2A: Grouped by Cell, Compact

Groups failures by (chrome, ref) cell. Shows run ID, iteration, exit code, duration, and the first 3 lines of stderr. Provides a retry command at the bottom.

**No failures:**

```
$ chrome-ranger status --failures

No failures recorded.
```

**Single failure:**

```
$ chrome-ranger status --failures

1 failure in 1 cell:

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)
  run f7g8h9i0  iteration #3  exit:1  2891ms
  stderr:
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

  Full output: .chrome-ranger/output/f7g8h9i0.stderr

Retry: chrome-ranger run --chrome 120.0.6099.109 --refs feature/virtual-list
```

**Multiple failures across cells:**

```
$ chrome-ranger status --failures

4 failures in 2 cells:

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)    2 failures
  run f7g8h9i0  iteration #1  exit:1  3891ms
  run a2b3c4d5  iteration #3  exit:1  2891ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d)     2 failures
  run e6f7g8h9  iteration #2  exit:1  2891ms
  run b3c4d5e6  iteration #4  exit:137  1002ms
  stderr (run e6f7g8h9):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  stderr (run b3c4d5e6):
    Error: page.goto: net::ERR_CONNECTION_REFUSED
        at bench.spec.ts:3:9

Retry all: chrome-ranger run --refs feature/virtual-list
Retry one: chrome-ranger run --chrome 120.0.6099.109 --refs feature/virtual-list
```

**Failures with long stderr (truncated):**

```
$ chrome-ranger status --failures

1 failure in 1 cell:

Chrome 121.0.6167.85 x main (e7f8a9b)                     1 failure
  run c4d5e6f7  iteration #2  exit:1  15230ms
  stderr (first 10 lines, 48 lines total):
    FAIL tests/bench.spec.ts
    Error: expect(received).toBeLessThan(expected)

    Expected: 5000
    Received: 8923

        at Object.<anonymous> (bench.spec.ts:12:27)
        at Promise.then.completed (node_modules/jest/...)
        at new Promise (<anonymous>)
        at callAsyncCircusFn (node_modules/jest/...)

  Full output: .chrome-ranger/output/c4d5e6f7.stderr (48 lines)

Retry: chrome-ranger run --chrome 121.0.6167.85 --refs main
```

**Pros:** Grouping by cell is the natural mental model — you think "which (chrome, ref) pair broke?" not "what happened at 10:31am?" The run ID is right there for cross-referencing output files. Retry commands are copy-pasteable. Identical stderr is deduplicated to avoid noise.

**Cons:** If failures span many cells with different errors, the output gets long. The "grouped" view hides chronological patterns (e.g., "everything after iteration #3 failed" would be easier to spot chronologically).

---

### Variation 2B: Flat Chronological List with Context Banner

Lists every failure chronologically as it happened. Each entry is self-contained — you can read any single failure without needing context from the rest. A banner at the top summarizes the damage, and a "pattern detection" section at the bottom highlights commonalities.

**No failures:**

```
$ chrome-ranger status --failures

No failures. All 45 iterations passed.
```

**Single failure:**

```
$ chrome-ranger status --failures

1 of 45 iterations failed
Affected cells: Chrome 120 x feature/virtual-list

---

[1] Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d) #3
    run: f7g8h9i0  |  exit: 1  |  duration: 2891ms  |  2026-02-18 10:34:12Z

    > Error: Timed out waiting for selector "tr:nth-child(1000)"
    >     at bench.spec.ts:5:15

---

Retry failed cells:
  chrome-ranger run --chrome 120.0.6099.109 --refs feature/virtual-list
```

**Multiple failures across cells:**

```
$ chrome-ranger status --failures

4 of 45 iterations failed
Affected cells: Chrome 120 x feature/virtual-list (2), Chrome 122 x feature/virtual-list (2)

---

[1] Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d) #1
    run: f7g8h9i0  |  exit: 1  |  duration: 3891ms  |  2026-02-18 10:31:44Z

    > Error: Timed out waiting for selector "tr:nth-child(1000)"
    >     at bench.spec.ts:5:15

[2] Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d) #3
    run: a2b3c4d5  |  exit: 1  |  duration: 2891ms  |  2026-02-18 10:33:02Z

    > Error: Timed out waiting for selector "tr:nth-child(1000)"
    >     at bench.spec.ts:5:15

[3] Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d) #2
    run: e6f7g8h9  |  exit: 1  |  duration: 2891ms  |  2026-02-18 10:35:18Z

    > Error: Timed out waiting for selector "tr:nth-child(1000)"
    >     at bench.spec.ts:5:15

[4] Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d) #4
    run: b3c4d5e6  |  exit: 137  |  duration: 1002ms  |  2026-02-18 10:36:55Z

    > Error: page.goto: net::ERR_CONNECTION_REFUSED
    >     at bench.spec.ts:3:9

---

Patterns:
  - All failures on ref feature/virtual-list (a1b2c3d)
  - 3 of 4 failures: same error (Timed out waiting for selector)

Retry all failed cells:
  chrome-ranger run --refs feature/virtual-list
```

**Failures with long stderr:**

```
$ chrome-ranger status --failures

1 of 45 iterations failed
Affected cells: Chrome 121 x main

---

[1] Chrome 121.0.6167.85 x main (e7f8a9b) #2
    run: c4d5e6f7  |  exit: 1  |  duration: 15230ms  |  2026-02-18 10:38:01Z

    > FAIL tests/bench.spec.ts
    > Error: expect(received).toBeLessThan(expected)
    >
    > Expected: 5000
    > Received: 8923
    >
    >     at Object.<anonymous> (bench.spec.ts:12:27)
    ...  (38 more lines)

    See full stderr: .chrome-ranger/output/c4d5e6f7.stderr

---

Retry:
  chrome-ranger run --chrome 121.0.6167.85 --refs main
```

**Pros:** Chronological order reveals temporal patterns (e.g., "failures started after iteration #3 for everything"). Each entry is fully self-contained. The "Patterns" section at the bottom is extremely actionable — it synthesizes what a human would have to figure out manually. Timestamps are included for correlation with external events.

**Cons:** More verbose than 2A for the same data. Duplicate stderr appears multiple times (though truncated). The pattern detection section requires non-trivial logic to implement well.

---

### Variation 2C: Failure Matrix + Detail Drill-Down

Opens with a compact failure matrix (same shape as the status grid, but only showing failure counts), then expands into detail for each affected cell. A two-level view — scan the matrix for where, then read details for why.

**No failures:**

```
$ chrome-ranger status --failures

No failures.

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       -                 -                    -
Chrome 121       -                 -                    -
Chrome 122       -                 -                    -
```

**Single failure:**

```
$ chrome-ranger status --failures

1 failure in 1 cell

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       -                 -                    1 FAIL
Chrome 121       -                 -                    -
Chrome 122       -                 -                    -

Details:

  Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d) -- 1 of 5 failed
  ┌──────────────────┬──────┬──────────┬─────────────────────────────────────────────┐
  │ run              │ iter │ exit/dur │ stderr                                      │
  ├──────────────────┼──────┼──────────┼─────────────────────────────────────────────┤
  │ f7g8h9i0         │ #3   │ 1/2891ms │ Error: Timed out waiting for selector       │
  │                  │      │          │ "tr:nth-child(1000)" at bench.spec.ts:5:15  │
  └──────────────────┴──────┴──────────┴─────────────────────────────────────────────┘

  Retry: chrome-ranger run --chrome 120.0.6099.109 --refs feature/virtual-list
```

**Multiple failures across cells:**

```
$ chrome-ranger status --failures

4 failures in 2 cells

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       -                 -                    2 FAIL
Chrome 121       -                 -                    -
Chrome 122       -                 -                    2 FAIL

Details:

  Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d) -- 2 of 5 failed
  ┌──────────────────┬──────┬───────────┬─────────────────────────────────────────────┐
  │ run              │ iter │ exit/dur  │ stderr (first line)                         │
  ├──────────────────┼──────┼───────────┼─────────────────────────────────────────────┤
  │ f7g8h9i0         │ #1   │ 1/3891ms  │ Error: Timed out waiting for selector ...   │
  │ a2b3c4d5         │ #3   │ 1/2891ms  │ Error: Timed out waiting for selector ...   │
  └──────────────────┴──────┴───────────┴─────────────────────────────────────────────┘

  Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d) -- 2 of 5 failed
  ┌──────────────────┬──────┬───────────┬─────────────────────────────────────────────┐
  │ run              │ iter │ exit/dur  │ stderr (first line)                         │
  ├──────────────────┼──────┼───────────┼─────────────────────────────────────────────┤
  │ e6f7g8h9         │ #2   │ 1/2891ms  │ Error: Timed out waiting for selector ...   │
  │ b3c4d5e6         │ #4   │ 137/1002ms│ Error: page.goto: net::ERR_CONNECTION_...   │
  └──────────────────┴──────┴───────────┴─────────────────────────────────────────────┘

  Retry all: chrome-ranger run --refs feature/virtual-list
```

**Failures with long stderr (handled by showing only the first line in the table):**

```
$ chrome-ranger status --failures

1 failure in 1 cell

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       -                 -                    -
Chrome 121       1 FAIL            -                    -
Chrome 122       -                 -                    -

Details:

  Chrome 121.0.6167.85 x main (e7f8a9b) -- 1 of 5 failed
  ┌──────────────────┬──────┬────────────┬────────────────────────────────────────────┐
  │ run              │ iter │ exit/dur   │ stderr (first line)                        │
  ├──────────────────┼──────┼────────────┼────────────────────────────────────────────┤
  │ c4d5e6f7         │ #2   │ 1/15230ms  │ FAIL tests/bench.spec.ts                   │
  └──────────────────┴──────┴────────────┴────────────────────────────────────────────┘

  Full stderr (48 lines): .chrome-ranger/output/c4d5e6f7.stderr

  Retry: chrome-ranger run --chrome 121.0.6167.85 --refs main
```

**Pros:** The failure matrix at the top gives instant spatial awareness — you see which cells are affected in the same grid layout you already know. Then you drill down. The tabular detail section keeps multiple failures in a cell visually aligned and scannable. Only the first line of stderr is shown in the table — enough to identify the error class without overwhelming.

**Cons:** Three visual modes in one output (matrix, then tables, then suggestions) — some users may find it too structured. The first-line-only stderr might not have the critical information (e.g., the assertion value is on line 4). More complex to implement due to the nested table rendering.

---

### Failures Variation Comparison

| Aspect | 2A (Grouped Compact) | 2B (Chronological) | 2C (Matrix + Drill-Down) |
|---|---|---|---|
| "Where did it break?" | Good (grouped) | Moderate (scan list) | Excellent (matrix heatmap) |
| "Why did it break?" | Good (multi-line stderr) | Good (multi-line stderr) | Moderate (first line only) |
| "When did it break?" | Not shown | Excellent (timestamps) | Not shown |
| "What should I do?" | Good (retry command) | Excellent (patterns + retry) | Good (retry command) |
| Output length (4 failures) | ~25 lines | ~40 lines | ~35 lines |
| Deduplication of stderr | Yes | No | Implicit (first line) |
| Implementation complexity | Low | Medium (pattern detection) | Medium (nested tables) |

---

## 3. `status --json`

Machine-readable output for scripting, piping to `jq`, feeding notebooks, or driving CI decisions. Must be complete enough that you never need to parse `runs.jsonl` separately for common analysis tasks.

---

### Variation 3A: Nested by Cell (Hierarchical)

Organizes output hierarchically: matrix definition at the top level, cells nested under chrome versions, individual runs nested under cells. Optimized for tree-walking in jq or programmatic access in scripts/notebooks.

```
$ chrome-ranger status --json | jq .
```

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
    "targetPerCell": 5,
    "cellsComplete": 7,
    "cellsIncomplete": 0,
    "cellsWithFailures": 2,
    "cellsTotal": 9,
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
      },
      "runs": [
        {"id": "a1b2c3d4-...", "iteration": 0, "exitCode": 0, "durationMs": 4523, "timestamp": "2026-02-18T10:30:00.000Z"},
        {"id": "e5f6a7b8-...", "iteration": 1, "exitCode": 0, "durationMs": 4210, "timestamp": "2026-02-18T10:30:05.000Z"},
        {"id": "c9d0e1f2-...", "iteration": 2, "exitCode": 0, "durationMs": 4102, "timestamp": "2026-02-18T10:30:10.000Z"},
        {"id": "a3b4c5d6-...", "iteration": 3, "exitCode": 0, "durationMs": 4198, "timestamp": "2026-02-18T10:30:15.000Z"},
        {"id": "e7f8a9b0-...", "iteration": 4, "exitCode": 0, "durationMs": 3688, "timestamp": "2026-02-18T10:30:20.000Z"}
      ]
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
      },
      "runs": [
        {"id": "f1a2b3c4-...", "iteration": 0, "exitCode": 0, "durationMs": 2301, "timestamp": "2026-02-18T10:31:00.000Z"},
        {"id": "d5e6f7a8-...", "iteration": 1, "exitCode": 0, "durationMs": 2455, "timestamp": "2026-02-18T10:31:05.000Z"},
        {"id": "b9c0d1e2-...", "iteration": 2, "exitCode": 0, "durationMs": 2189, "timestamp": "2026-02-18T10:31:10.000Z"},
        {"id": "f7g8h9i0-...", "iteration": 3, "exitCode": 1, "durationMs": 2891, "timestamp": "2026-02-18T10:31:15.000Z"},
        {"id": "a3b4c5d6-...", "iteration": 4, "exitCode": 0, "durationMs": 2098, "timestamp": "2026-02-18T10:31:20.000Z"}
      ]
    }
  ]
}
```

**Typical jq usage:**

```bash
# Get all failed run IDs
chrome-ranger status --json | jq '[.cells[].runs[] | select(.exitCode != 0) | .id]'

# Get median duration per cell
chrome-ranger status --json | jq '.cells[] | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'

# Are all cells complete? (CI gate)
chrome-ranger status --json | jq '.summary.cellsIncomplete == 0 and .summary.failed == 0'

# Get the slowest cell
chrome-ranger status --json | jq '.cells | sort_by(.stats.medianMs) | last | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'
```

**Pros:** Hierarchical structure maps naturally to how you think about the data: matrix -> cells -> runs. Pre-computed stats (`min`, `max`, `mean`, `median`) mean you rarely need to do math in jq. The `complete` boolean is a direct CI gate. Schema version field enables future evolution. Includes all run IDs for cross-referencing with output files.

**Cons:** Deeply nested — some jq expressions get long. Large matrices with many iterations produce very large output (24 cells x 10 runs = 240 run objects). The pre-computed stats might disagree with the user's own computation if they want to exclude outliers.

---

### Variation 3B: Flat Run List with Cell Summaries (Two-Level)

Two top-level arrays: `cells` for per-cell summaries (no individual runs), and `runs` for a flat list of every run. This mirrors the natural split between "matrix status" and "run data." Optimized for feeding into pandas/notebooks where you want a flat table.

```
$ chrome-ranger status --json | jq .
```

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
    "wallTimeMs": 202000
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
      "durationMinMs": 3688,
      "durationMaxMs": 4523,
      "durationMeanMs": 4067,
      "durationMedianMs": 4102
    },
    {
      "chrome": "120.0.6099.109",
      "ref": "v4.5.0",
      "sha": "c3d4e5f",
      "target": 5,
      "passed": 5,
      "failed": 0,
      "complete": true,
      "durationMinMs": 3591,
      "durationMaxMs": 3955,
      "durationMeanMs": 3755,
      "durationMedianMs": 3744
    },
    {
      "chrome": "120.0.6099.109",
      "ref": "feature/virtual-list",
      "sha": "a1b2c3d",
      "target": 5,
      "passed": 4,
      "failed": 1,
      "complete": false,
      "durationMinMs": 2098,
      "durationMaxMs": 2455,
      "durationMeanMs": 2249,
      "durationMedianMs": 2245
    }
  ],
  "runs": [
    {"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "iteration": 0, "exitCode": 0, "durationMs": 4523, "timestamp": "2026-02-18T10:30:00.000Z"},
    {"id": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "iteration": 1, "exitCode": 0, "durationMs": 4210, "timestamp": "2026-02-18T10:30:05.000Z"},
    {"id": "c3d4e5f6-a7b8-9012-cdef-123456789012", "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "iteration": 2, "exitCode": 0, "durationMs": 4102, "timestamp": "2026-02-18T10:30:10.000Z"},
    {"id": "d4e5f6a7-b8c9-0123-defa-234567890123", "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "iteration": 3, "exitCode": 0, "durationMs": 4198, "timestamp": "2026-02-18T10:30:15.000Z"},
    {"id": "e5f6a7b8-c9d0-1234-efab-345678901234", "chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "iteration": 4, "exitCode": 0, "durationMs": 3688, "timestamp": "2026-02-18T10:30:20.000Z"},
    {"id": "f7g8h9i0-j1k2-3456-lmno-pqrstuvwxyz0", "chrome": "120.0.6099.109", "ref": "feature/virtual-list", "sha": "a1b2c3d", "iteration": 3, "exitCode": 1, "durationMs": 2891, "timestamp": "2026-02-18T10:31:15.000Z"}
  ]
}
```

Note: The `runs` array above is truncated for readability. In practice it contains all 45 runs.

**Typical usage:**

```bash
# Feed directly to pandas (Python)
# chrome-ranger status --json | python3 -c "
#   import json, sys, pandas as pd
#   data = json.load(sys.stdin)
#   df = pd.DataFrame(data['runs'])
#   print(df.groupby(['chrome', 'ref'])['durationMs'].describe())
# "

# CI gate: fail if any cell is incomplete or has failures
chrome-ranger status --json | jq -e '.summary.cellsComplete == .summary.cellsTotal and .summary.failed == 0'

# Get all failed runs with their output file paths
chrome-ranger status --json | jq '[.runs[] | select(.exitCode != 0) | {id, chrome, ref, iteration, file: ".chrome-ranger/output/\(.id).stderr"}]'

# Duration comparison across Chrome versions for a specific ref
chrome-ranger status --json | jq '[.cells[] | select(.ref == "main") | {chrome, medianMs: .durationMedianMs}]'
```

**Pros:** The flat `runs` array is trivially convertible to a DataFrame or CSV — no flattening needed. Cell summaries and individual runs are cleanly separated, so you can use whichever level of detail you need. The `cells` array is small and fast to scan even for large matrices. Cell-level stats are pre-computed, but you can always re-derive from the `runs` array if you want different statistics.

**Cons:** Duplicated data — each run repeats `chrome`, `ref`, `sha` (denormalized). For a 6x4 matrix with 10 iterations, the `runs` array has 240 objects at ~200 bytes each = ~48KB of runs alone. Not a problem in practice, but worth noting. Users doing hierarchical analysis (e.g., "for each Chrome version, for each ref, ...") have to group/filter the flat list themselves.

---

### JSON Schema Comparison

| Aspect | 3A (Nested/Hierarchical) | 3B (Flat Two-Level) |
|---|---|---|
| Structure | cells[].runs[] | cells[] + runs[] (separate) |
| "Get cell summary" | `jq '.cells[]'` | `jq '.cells[]'` |
| "Get all runs" | `jq '[.cells[].runs[]]'` | `jq '.runs[]'` |
| "Get runs for a cell" | `jq '.cells[] \| select(.chrome==X and .ref==Y) \| .runs[]'` | `jq '.runs[] \| select(.chrome==X and .ref==Y)'` |
| pandas friendliness | Needs flattening | Direct `pd.DataFrame(data['runs'])` |
| Output size (3x3, 5 iter) | ~4KB | ~5KB (denormalized) |
| Output size (6x4, 10 iter) | ~30KB | ~50KB (denormalized) |
| jq "get all failures" | `[.cells[].runs[] \| select(.exitCode!=0)]` | `[.runs[] \| select(.exitCode!=0)]` |
| Pre-computed stats | Nested in cell | Flat in cell |
| Schema version | Yes (`version: 1`) | Yes (`version: 1`) |

---

### Schema Versioning Note

Both variations include `"version": 1` at the top level. The contract:

- **version 1**: The shape shown above. Fields may be added (backward-compatible) but never removed or renamed.
- If a breaking change is ever needed, `version` increments. Tools checking `version` can fail gracefully.
- The `--json` output goes to **stdout** (unlike all other CLI output which goes to stderr). This is what enables piping to `jq`, `python`, files, etc.

---

## Design Recommendations

### For `status` (default view)

**Recommended: Variation 1A (Unified Grid with Bars and Summary Footer).**

It has the strongest visual continuity with the live-run display (Options A/D). The bars in status match the bars users saw during the run — same axis, same layout, same reading pattern. The summary footer tells you what to do next without requiring you to know any flags. Variation 1B is a good fallback for `--plain` or narrow terminals. Variation 1C is attractive but the added width and box-drawing characters are liabilities.

### For `--failures`

**Recommended: Variation 2A (Grouped by Cell, Compact) as the base, with the "Patterns" summary from 2B.**

The grouped-by-cell structure matches how users think about failures in a matrix context: "which cell is broken?" The deduplication of identical stderr is practical — benchmark tests often fail the same way repeatedly. But the "Patterns" section from 2B is too useful to leave out; it answers "is this one bug or many?" at a glance. Timestamps (from 2B) could be added as a `--verbose` enhancement rather than default.

Concrete proposal for the hybrid:

```
$ chrome-ranger status --failures

4 failures in 2 cells:

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)    2 failures
  run f7g8h9i0  iteration #1  exit:1  3891ms
  run a2b3c4d5  iteration #3  exit:1  2891ms
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 122.0.6261.94 x feature/virtual-list (a1b2c3d)     2 failures
  run e6f7g8h9  iteration #2  exit:1  2891ms
  run b3c4d5e6  iteration #4  exit:137  1002ms
  stderr (run e6f7g8h9):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  stderr (run b3c4d5e6):
    Error: page.goto: net::ERR_CONNECTION_REFUSED
        at bench.spec.ts:3:9

Pattern: all failures on ref feature/virtual-list

Retry all: chrome-ranger run --refs feature/virtual-list
```

### For `--json`

**Recommended: Variation 3B (Flat Two-Level).**

The flat `runs` array is the killer feature. Users of `--json` are almost certainly going to put this data into a DataFrame, a notebook, or a CI script. Having to flatten nested arrays is a tax on every consumer. The separate `cells` array gives you pre-computed summaries without wading through individual runs. The denormalization cost (repeated `chrome`/`ref` fields) is trivial — we are talking about kilobytes, not megabytes.

Both variations should include the schema version. Both should write to stdout while all other CLI output goes to stderr.
