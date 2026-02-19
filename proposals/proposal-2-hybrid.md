# Proposal 2: Hybrid Matrix Header + Scrolling Log

## Design philosophy

Progressive disclosure: overview first, detail on demand. The terminal is split into two regions -- a pinned header that shows the matrix overview, and a scrolling log below it that streams individual iteration results as they complete. You get the bird's-eye view and the ground-level detail simultaneously, and the scrolling log survives the run as scrollback history.

The tradeoff is explicit: you accept the complexity of ANSI scroll regions and a taller display in exchange for real-time per-iteration visibility. When an iteration fails, you see it immediately in the log with its duration and exit code -- you do not have to wait for the run to finish or inspect a separate command to understand what happened. The scrolling log also serves as a natural audit trail: after the run, scrolling up reveals the full chronological history of every iteration.

---

## Color conventions

All color is additive. The display is fully legible without color support.

| Role | ANSI code | Usage |
|---|---|---|
| Green | `\x1b[32m` | Passed iterations in log, `✓` suffix, filled bar segments |
| Red | `\x1b[31m` | `FAIL` suffix in log, `✗` in bars and dot sequences, failure counts |
| Yellow | `\x1b[33m` | Active worker labels |
| Dim | `\x1b[2m` | Not-started cells (`0/N`), empty bar segments (`░`) |
| Bold | `\x1b[1m` | Progress header line |
| Reset | `\x1b[0m` | After every colored span |

No background colors. Safe on both dark and light terminal themes.

---

## Live run display

### Layout structure

The display has two regions separated by a horizontal rule:

```
PINNED HEADER (redrawn in place via ANSI cursor control)
  Line 1:       Progress line
  Line 2:       Blank
  Lines 3-N:    Matrix rows (one per Chrome version, inline bars per ref)
  Line N+1:     Blank
  Lines N+2-M:  Worker status (2 workers per line)
  Line M+1:     Separator (--- during run, === on completion)

SCROLLING LOG (normal terminal output, scrolls naturally)
  One line per completed iteration, appended chronologically
```

### Header height

```
1  progress line
1  blank
C  chrome version rows (one per version)
1  blank
W  worker rows (ceil(active_workers / 2))
1  separator
```

Standard (3x3, 4 workers): 1 + 1 + 3 + 1 + 2 + 1 = **9 lines**
Large (6x4, 6 workers): 1 + 1 + 6 + 1 + 3 + 1 = **13 lines**

The worker section shrinks as workers become idle near the end of the run.

### Progress line

Format:

```
chrome-ranger run  {done}/{total}  {pct}%  elapsed {time}
```

With failures (right-aligned):

```
chrome-ranger run  {done}/{total}  {pct}%  elapsed {time}                       {N} failed
```

On completion:

```
chrome-ranger run  {done}/{total}  100%  {total_time}                            {N} failed
```

### Matrix rows

Each row contains one Chrome version label followed by inline progress bars for every ref:

```
 chrome@120  main ███░░ 3/5   v4.5.0 █░░░░ 1/5   v5.0.0-b ░░░░░ 0/5
```

**Bar characters:** U+2588 FULL BLOCK (`█`) for passed iterations, U+2591 LIGHT SHADE (`░`) for remaining iterations, U+2717 BALLOT X (`✗`) for failed iterations. The `✗` is rendered in red and occupies the exact position of the failed iteration within the bar.

**Bar width:** 1:1 with iterations when the iteration count is 10 or fewer. For higher iteration counts, bars scale down (each character represents 2+ iterations) with the fraction providing the exact count.

**Cell suffixes:**
- In progress: fraction only (`3/5`)
- Complete, all passed: `✓` (U+2713 CHECK MARK, green). Denominator dropped at scale: `10 ✓` instead of `10/10 ✓`
- Has failures: `✗N` (U+2717 BALLOT X + count, red). e.g., `✗1` means 1 failure
- Not started: `0/5` (dim)

**Why `✓`/`✗` instead of `ok`/`FAIL`:** In this design, every cell already contains a visual progress bar that conveys the shape of the run. The suffix is a quick-scan signal, not the primary information carrier. A single-character `✓` is sufficient alongside the bar, and `✗1` (2 characters) is more compact than `FAIL` (4 characters) while also encoding the failure count. The bar provides the spatial detail that `FAIL` would otherwise need to convey in text.

### Ref name truncation

Same strategy as Proposal 1:

1. Use full name if it fits
2. Strip common prefixes: `feature/` -> `virtual-list`
3. Abbreviate segments: `virtual-list` -> `virt-list`
4. Use initials: `feature/virtual-list` -> `fvl`

Full ref names always appear in the scrolling log lines and in `--failures` output.

### Worker status

Workers are displayed below the matrix, two per line. Format: `wN chrome@VER x REF #ITER  {elapsed}s`. Idle workers are omitted.

```
 w1 chrome@120 x v4.5.0 #2        3.1s    w3 chrome@122 x main #4          0.6s
 w2 chrome@121 x v5.0.0-b #1      4.1s    w4 chrome@122 x v5.0.0-b #1     3.2s
```

Elapsed time ticks up live. When workers finish (near end of run with only 1-2 active), the worker section shrinks and the header becomes shorter.

### Scrolling log lines

Each completed iteration produces one line below the separator:

```
  [ 3/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
```

Failed iterations are red with a `FAIL` suffix:

```
  [21/45] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #2        2455ms  exit:1  FAIL
```

Log lines use full ref names and include the resolved SHA. They are self-contained (each line has all the context needed to understand what happened).

### Separator

During the run: `---` (dim)
On completion: `===` (normal weight, signals finality)

---

## Live display states: 3x3 matrix

Config: 3 Chrome versions, 3 refs, 5 iterations, 1 warmup, 4 workers.
Matrix: 9 cells, 45 total iterations, 9 warmup iterations.

### Warmup phase

```
chrome-ranger run  warmup 5/9  elapsed 0:18

 chrome@120  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5
 chrome@121  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5
 chrome@122  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5

 w1 chrome@120 x main warmup     2.4s    w3 chrome@122 x main warmup     3.6s
 w2 chrome@121 x v4.5.0 warmup   1.1s    w4 chrome@120 x v5.0.0-b warmup 0.8s
---
  [warmup] chrome@120 x main (e7f8a9b)                    4102ms
  [warmup] chrome@121 x main (e7f8a9b)                    3891ms
  [warmup] chrome@120 x v4.5.0 (c3d4e5f)                  3744ms
  [warmup] chrome@121 x v4.5.0 (c3d4e5f)                  3688ms
  [warmup] chrome@122 x main (e7f8a9b)                    4301ms
```

During warmup, the progress line shows `warmup {done}/{total}`. All matrix cells stay at `0/N`. Workers show `warmup` instead of an iteration number. Warmup completions appear in the scrolling log with a `[warmup]` tag and duration but no exit code (warmup results are discarded). This gives visibility into warmup durations, which helps detect misconfigured environments early.

### Early run (6/45 done)

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

Header: 9 lines. The block bars are 5 characters wide (1:1 with iterations). Not-started cells and their bars are dim. Idle workers are shown dimmed in parentheses -- they appear because not all workers have been dispatched yet. Once all workers are busy, idle entries disappear.

Width: `" chrome@122  main █████ 5/5   v4.5.0 █████ 5/5   v5.0.0-b █████ 5/5"` = ~74 characters. Fits at 80 columns.

The scrolling log below `---` shows each completed iteration with its full cell identifier, duration, and exit code. You can already see that `chrome@120 x main` iterations are taking ~4200-4500ms.

### Mid-run with 1 failure (28/45 done)

```
chrome-ranger run  28/45  62%  elapsed 2:14                         1 failed

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ███✗░ 3/5 ✗1
 chrome@121  main █████ 5/5 ✓  v4.5.0 ███░░ 3/5    v5.0.0-b █░░░░ 1/5
 chrome@122  main ████░ 4/5    v4.5.0 ░░░░░ 0/5    v5.0.0-b █░░░░ 1/5

 w1 chrome@121 x v4.5.0 #3        2.4s    w3 chrome@122 x main #4          0.6s
 w2 chrome@121 x v5.0.0-b #1      4.1s    w4 chrome@122 x v5.0.0-b #1     3.2s
---
  [21/45] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #2        2455ms  exit:1  FAIL
  [22/45] chrome@121 x main (e7f8a9b) #4                  4088ms  exit:0
  [23/45] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #3        2189ms  exit:0
  [24/45] chrome@121 x v4.5.0 (c3d4e5f) #1                3291ms  exit:0
  [25/45] chrome@122 x main (e7f8a9b) #2                  4301ms  exit:0
  [26/45] chrome@121 x v4.5.0 (c3d4e5f) #2                3402ms  exit:0
  [27/45] chrome@122 x main (e7f8a9b) #3                  4102ms  exit:0
  [28/45] chrome@121 x v5.0.0-beta.1 (f9a0b1c) #0        2102ms  exit:0
```

Key details:
- `███✗░ 3/5 ✗1` -- the `✗` (red) occupies the 4th bar position, showing exactly which iteration failed. The suffix `✗1` gives the count. The fraction `3/5` counts only passes.
- Complete cells: `█████ 5/5 ✓` (green). You can scan the matrix for non-`✓` cells to find what needs attention.
- `1 failed` in the header is right-aligned and red.
- In the scrolling log, iteration 21 (the failure) is rendered in red with `FAIL`. You can see its duration (2455ms) and exit code immediately. You can also see that subsequent iterations on the same cell (#3, 2189ms) passed -- the failure was transient.
- All 4 workers are active. Worker w2 at 4.1s is the longest-running.

### Complete with 2 failures (45/45)

On completion, the header transforms: workers are replaced by a summary block. The separator changes to `===`.

```
chrome-ranger run  45/45  100%  3m 22s                              2 failed

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1
 chrome@121  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@122  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1

 Done. 45 runs in 3m 22s, 2 failed in 2 cells.
 See: chrome-ranger status --failures
===
```

Header: 8 lines. The summary replaces the worker section, so the header is actually shorter on completion than during the run. The scroll region is released so the user can scroll up through the full chronological log. The `===` separator signals finality.

### Complete, all pass (45/45)

```
chrome-ranger run  45/45  100%  3m 02s

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@121  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@122  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓

 Done. 45 runs in 3m 02s, all passed.
 Logged to .chrome-ranger/runs.jsonl
===
```

Clean. No failure counter, no red. Summary points to the output file.

---

## Live display state: 6x4 large matrix

Config: 6 Chrome versions, 4 refs, 10 iterations, 1 warmup, 6 workers.
Matrix: 24 cells, 240 total iterations, 24 warmup iterations.

### Mid-run (80/240 done, 3 failures)

```
chrome-ranger run  80/240  33%  elapsed 4:38                       3 failed

 chrome@118  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ████████░░ 8/10  feat/vl ██████✗░░░ 6/10 ✗1
 chrome@119  main ██████████ 10 ✓  v4.5.0 ██████████ 10 ✓  v5.0.0-b ████░░░░░░ 4/10  feat/vl ██░░░░░░░░ 2/10
 chrome@120  main ██████████ 10 ✓  v4.5.0 ██████░░░░ 6/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10
 chrome@121  main ███████░░░ 7/10  v4.5.0 ██░░░░░░░░ 2/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10
 chrome@122  main ███░░░░░░░ 3/10  v4.5.0 █░░░░░░░░░ 1/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10
 chrome@123  main ░░░░░░░░░░ 0/10  v4.5.0 ░░░░░░░░░░ 0/10  v5.0.0-b ░░░░░░░░░░ 0/10  feat/vl ░░░░░░░░░░ 0/10

 w1 chrome@121 x v5.0.0-b #4    1.2s    w4 chrome@122 x v4.5.0 #1    0.4s
 w2 chrome@122 x main #3        3.6s    w5 chrome@120 x feat/vl #7   4.1s
 w3 chrome@121 x feat/vl #6     2.8s    w6 chrome@120 x v5.0.0-b #9  1.7s
---
  [ 77/240] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #7      2301ms  exit:0
  [ 78/240] chrome@118 x feature/virtual-list (a1b2c3d) #6  2891ms  exit:1  FAIL
  [ 79/240] chrome@121 x v4.5.0 (c3d4e5f) #6              3402ms  exit:0
  [ 80/240] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #8       2189ms  exit:0
```

Header: 13 lines. Bars are 10 characters wide (1:1 with iterations). Each matrix line is ~115 characters at full width -- fits 120-column terminals.

Key details:
- Complete cells: `██████████ 10 ✓` (denominator dropped for compactness)
- The `✗` in `chrome@118 x feat/vl`'s bar shows exactly where the failure occurred (position 7, zero-indexed iteration #6)
- All 6 workers active, packed into 3 lines
- The scrolling log shows iteration 78 as a `FAIL` in red -- you can see the exit code and duration immediately without waiting for the run to finish
- Log lines use full ref names (`feature/virtual-list`, `v5.0.0-beta.1`) even though the header abbreviates them

**100-column fallback:** At terminals narrower than 120 columns, bars shrink to 5 characters (each block = 2 iterations):

```
 chrome@118  main █████ 10 ✓  v4.5.0 █████ 10 ✓  v5.0.0-b ████░ 8/10  feat/vl ███✗░ 6/10 ✗1
```

The bar is approximate (each character represents 2 iterations), but the fraction is exact. Bar width is decided once at startup based on `process.stderr.columns`.

---

## `status` command

The `status` command shows a static matrix grid read from `runs.jsonl`. It uses the same bar + fraction format as the live display but without worker status or the scrolling log. Output goes to **stderr**.

### Empty (no runs)

```
$ chrome-ranger status

 chrome@120  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5
 chrome@121  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5
 chrome@122  main ░░░░░ 0/5   v4.5.0 ░░░░░ 0/5   v5.0.0-b ░░░░░ 0/5

No runs recorded.
```

### Partial (mid-run or after interruption)

```
$ chrome-ranger status

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ██░░░ 2/5
 chrome@121  main █████ 5/5 ✓  v4.5.0 ███░░ 3/5    v5.0.0-b ░░░░░ 0/5
 chrome@122  main ████░ 4/5    v4.5.0 ░░░░░ 0/5    v5.0.0-b ░░░░░ 0/5

29/45 complete (0 failed)
```

### Complete with failures

```
$ chrome-ranger status

 chrome@120  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1
 chrome@121  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b █████ 5/5 ✓
 chrome@122  main █████ 5/5 ✓  v4.5.0 █████ 5/5 ✓  v5.0.0-b ████✗ 4/5 ✗1

45/45 complete (2 failed in 2 cells)
Failures in: chrome@120 x v5.0.0-beta.1, chrome@122 x v5.0.0-beta.1
```

The bars show failure positions. You can see both failures occurred at iteration #4 (the 5th position).

### After `--append 3`

```
$ chrome-ranger status

 chrome@120  main ████████ 8/8 ✓  v4.5.0 ████████ 8/8 ✓  v5.0.0-b ███████✗ 7/8 ✗1
 chrome@121  main ████████ 8/8 ✓  v4.5.0 ████████ 8/8 ✓  v5.0.0-b ████████ 8/8 ✓
 chrome@122  main ████████ 8/8 ✓  v4.5.0 ████████ 8/8 ✓  v5.0.0-b ███████✗ 7/8 ✗1

72/72 complete (2 failed in 2 cells)
```

The bars have grown from 5 to 8 characters, reflecting the new target (original 5 + appended 3). The failure positions are preserved in the expanded bar.

---

## `status --failures`

Static, pipe-friendly output for investigating failures after a run. Groups by cell. Shows per-iteration dot sequences, stderr excerpts, and an actionable retry command.

The dot sequence uses U+25CF BLACK CIRCLE (`●`, green) for passes and U+2717 BALLOT X (`✗`, red) for failures, in iteration order. This gives instant visual recognition of where failures cluster (early? late? random?).

### No failures

```
$ chrome-ranger status --failures

No failures. All 45 iterations passed.
```

### 2 failures in 2 cells

```
$ chrome-ranger status --failures

2 failures in 2 cells

Chrome 120.0.6099.109 x v5.0.0-beta.1 (f9a0b1c)           1 of 5 failed
  ●●●✗●  4/5 passed, 1 failed
  #3  exit:1  2455ms  run:f7g8h9i0
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/f7g8h9i0.stderr

Chrome 122.0.6261.94 x v5.0.0-beta.1 (f9a0b1c)            1 of 5 failed
  ●●✗●●  4/5 passed, 1 failed
  #2  exit:1  2891ms  run:e6f7g8h9
  stderr (last 3 lines):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15
  output: .chrome-ranger/output/e6f7g8h9.stderr

Pattern: all failures on ref v5.0.0-beta.1, same error

Retry: chrome-ranger run --refs v5.0.0-beta.1
```

### 5 failures across 3 cells (large matrix)

```
$ chrome-ranger status --failures

5 failures in 3 cells

Chrome 118.0.5993.70 x feature/virtual-list (a1b2c3d)      2 of 10 failed
  ●●●●●●✗●●✗  8/10 passed, 2 failed
  #6  exit:1  2891ms  run:a1b2c3d4
  #9  exit:1  3102ms  run:d4e5f6a7
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 120.0.6099.109 x feature/virtual-list (a1b2c3d)     2 of 10 failed
  ●●●●●●●✗●✗  8/10 passed, 2 failed
  #7  exit:1  2710ms  run:g7h8i9j0
  #9  exit:1  2891ms  run:k1l2m3n4
  stderr (both identical):
    Error: Timed out waiting for selector "tr:nth-child(1000)"
        at bench.spec.ts:5:15

Chrome 123.0.6312.58 x v5.0.0-beta.1 (f9a0b1c)            1 of 10 failed
  ●●●●✗●●●●●  9/10 passed, 1 failed
  #4  exit:2  1823ms  run:o5p6q7r8
  stderr:
    ENOENT: no such file or directory, open '/tmp/bench-result.json'
        at Object.openSync (node:fs:603:3)
  output: .chrome-ranger/output/o5p6q7r8.stderr

Pattern: 4 of 5 failures on ref feature/virtual-list (same error: Timed out)

Retry all: chrome-ranger run --refs feature/virtual-list --refs v5.0.0-beta.1
Full stderr: cat .chrome-ranger/output/<run-id>.stderr
```

Design details:
- **Dot sequences** give immediate spatial recognition of failure positions
- **Grouped by cell** -- the natural mental model for matrix-based analysis
- **Stderr deduplication:** When multiple failures in the same cell share identical stderr, shown once with `stderr (both identical):`
- **Pattern line** synthesizes commonalities: "all failures on ref X", "same error". Answers "one bug or many?" in one line
- **Retry command** is copy-pasteable, scoped to affected refs
- **Default stderr lines:** Last 3 lines (`--lines N` to configure). Use `--failures --verbose` for full stderr with timestamps

### Verbose mode

`chrome-ranger status --failures --verbose` shows the full stderr for every failed iteration (no truncation, no deduplication), plus ISO 8601 timestamps:

```
  #3  exit:1  2455ms  run:f7g8h9i0  2026-02-18T10:33:09Z
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

Output goes to **stdout**. All other CLI output goes to stderr. This enables `chrome-ranger status --json | jq ...` to work without interference.

### Schema

The schema is hierarchical: cells contain their runs. This maps naturally to how you think about matrix data (browse cells, drill into iterations) and makes jq queries clean.

Pre-computed stats per cell (`min`, `max`, `mean`, `median`) are computed over **passing runs only**.

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
      {"name": "v5.0.0-beta.1", "sha": "f9a0b1c"}
    ]
  },
  "summary": {
    "totalRuns": 45,
    "passed": 43,
    "failed": 2,
    "remaining": 0,
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
      },
      "runs": [
        {
          "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "iteration": 0,
          "exitCode": 0,
          "durationMs": 4523,
          "timestamp": "2026-02-18T10:30:00.000Z"
        },
        {
          "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          "iteration": 1,
          "exitCode": 0,
          "durationMs": 4210,
          "timestamp": "2026-02-18T10:30:05.000Z"
        },
        {
          "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
          "iteration": 2,
          "exitCode": 0,
          "durationMs": 3999,
          "timestamp": "2026-02-18T10:30:10.000Z"
        },
        {
          "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
          "iteration": 3,
          "exitCode": 0,
          "durationMs": 3688,
          "timestamp": "2026-02-18T10:30:15.000Z"
        },
        {
          "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
          "iteration": 4,
          "exitCode": 0,
          "durationMs": 4102,
          "timestamp": "2026-02-18T10:30:20.000Z"
        }
      ]
    },
    {
      "chrome": "120.0.6099.109",
      "ref": "v5.0.0-beta.1",
      "sha": "f9a0b1c",
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
        {
          "id": "f6a7b8c9-d0e1-2345-fabc-456789012345",
          "iteration": 0,
          "exitCode": 0,
          "durationMs": 2301,
          "timestamp": "2026-02-18T10:31:00.000Z"
        },
        {
          "id": "a7b8c9d0-e1f2-3456-abcd-567890123456",
          "iteration": 1,
          "exitCode": 0,
          "durationMs": 2098,
          "timestamp": "2026-02-18T10:31:05.000Z"
        },
        {
          "id": "b8c9d0e1-f2a3-4567-bcde-678901234567",
          "iteration": 2,
          "exitCode": 0,
          "durationMs": 2455,
          "timestamp": "2026-02-18T10:31:10.000Z"
        },
        {
          "id": "f7g8h9i0-j1k2-3456-lmno-pqrstuvwxyz0",
          "iteration": 3,
          "exitCode": 1,
          "durationMs": 2891,
          "timestamp": "2026-02-18T10:31:15.000Z"
        },
        {
          "id": "c9d0e1f2-a3b4-5678-cdef-789012345678",
          "iteration": 4,
          "exitCode": 0,
          "durationMs": 2142,
          "timestamp": "2026-02-18T10:31:20.000Z"
        }
      ]
    }
  ]
}
```

The `cells` array is truncated above (showing 2 of 9 cells). In practice, all cells are included with all their runs.

### Schema design notes

- **`version: 1`** -- enables future schema evolution. Fields may be added but never removed within a version.
- **`stats` per cell** -- pre-computed over successful runs only (`exitCode === 0`). Omitted for cells with zero successful runs.
- **`complete` boolean** -- `true` when `passed >= target`. Direct CI gate: `jq '.cells | all(.complete)'`.
- **`summary.remaining`** -- counts iterations still needed. Zero when the matrix is complete (even with some failures, as long as enough passed).
- **`summary.firstRun` / `summary.lastRun`** -- timestamps for wall-time calculation and audit trails.
- **Hierarchical runs** -- each cell contains its own `runs[]` array. This makes jq access natural: `.cells[] | select(.ref == "main") | .runs[]`. For pandas, flatten with a one-liner: `[dict(r, chrome=c['chrome'], ref=c['ref']) for c in data['cells'] for r in c['runs']]`.

### Variants

**Failures filter:** `chrome-ranger status --json --failures` includes only cells with `failed > 0`. Summary still reflects the full matrix.

```bash
chrome-ranger status --json --failures | jq '.cells | length'
# => 2
```

### Typical usage

```bash
# CI gate: all cells complete with no failures?
chrome-ranger status --json | jq -e '.summary.remaining == 0 and .summary.failed == 0'

# Median duration per cell
chrome-ranger status --json | jq -r '.cells[] | "\(.chrome) x \(.ref): \(.stats.medianMs)ms"'

# Get all failed run IDs
chrome-ranger status --json | jq '[.cells[].runs[] | select(.exitCode != 0) | .id]'

# Export to CSV
chrome-ranger status --json | jq -r '.cells[].runs[] | [.chrome, .ref, .iteration, .durationMs, .exitCode] | @csv'

# Feed to pandas
chrome-ranger status --json | python3 -c "
  import json, sys, pandas as pd
  data = json.load(sys.stdin)
  runs = [dict(r, chrome=c['chrome'], ref=c['ref']) for c in data['cells'] for r in c['runs']]
  df = pd.DataFrame(runs)
  print(df.groupby(['chrome', 'ref'])['durationMs'].describe())
"
```

---

## Non-TTY fallback

When `!process.stderr.isTTY`, no ANSI codes are emitted. The pinned header is skipped entirely. Output is the scrolling log only -- one line per completed iteration:

```
[  1/45] chrome@120 x main (e7f8a9b) #0                  4523ms  exit:0
[  2/45] chrome@120 x main (e7f8a9b) #1                  4210ms  exit:0
[  3/45] chrome@121 x main (e7f8a9b) #0                  4102ms  exit:0
...
[21/45] chrome@120 x v5.0.0-beta.1 (f9a0b1c) #2         2455ms  exit:1  FAIL
...
[45/45] chrome@122 x v4.5.0 (c3d4e5f) #4                3802ms  exit:0

45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

This is identical to the scrolling log portion of the TTY display. The non-TTY fallback is a natural subset of the full display, not a separate format.

---

## Terminal sizing

Checked once at startup and on `SIGWINCH`.

### Row thresholds

| Terminal rows | Behavior |
|---|---|
| >= 20 | Full display: header + scrolling log (at least 7 lines visible for the log) |
| 15-19 | Compress worker section: show only 1 line of workers (most active 2), rest implied |
| 10-14 | No header. Pure scrolling log with a progress fraction prefix: `[13% 6/45] chrome@120 x main...` |
| < 10 | Same as non-TTY: plain sequential log, no ANSI |

### Column thresholds

| Terminal columns | Behavior |
|---|---|
| >= 120 | Full bar width (1:1 with iterations, up to 10 chars), full ref names |
| 100-119 | Bars at 5 chars (1:2 mapping for 10 iterations), abbreviated ref names |
| 80-99 | Bars at 5 chars, aggressive ref abbreviation, workers on 1 line |
| 60-79 | No bars. Matrix shows fractions only: `chrome@120  main 5/5 ✓  v4.5.0 3/5` |
| < 60 | Fall back to non-TTY sequential log |

Bar width decision is made once at startup. The formula:

```
row_label_width = max(chrome_labels) + 2
per_ref_budget = (columns - row_label_width) / num_refs
bar_width = min(iterations, per_ref_budget - overhead)
```

Where `overhead` accounts for the ref label, spaces, fraction, and suffix (~12-15 characters depending on iteration count).

---

## Implementation notes

### ANSI scroll region mechanics

On startup:

1. Compute header height: `H = 1 + 1 + num_chrome + 1 + ceil(workers/2) + 1`
2. Set scroll region: `\x1b[{H+1};{terminal_rows}r` -- this confines normal scrolling to the region below the header
3. Move cursor to row H+1 for the first log line

On each iteration completion:

1. Save cursor position: `\x1b[s`
2. Move to home: `\x1b[1;1H`
3. Repaint the header (all H lines)
4. Restore cursor position: `\x1b[u`
5. Write the log line at the current cursor position (it scrolls naturally within the scroll region)

The header is repainted only on iteration completion events and on a 1-second timer (for worker elapsed time updates). This avoids busy-looping while keeping worker times visually fresh.

### Scroll region pitfalls and mitigations

ANSI scroll regions (`\x1b[{top};{bottom}r`) are the most complex terminal mechanism in either proposal. Mitigations:

- **Always reset on exit:** Register a cleanup handler for `process.on('exit')`, SIGINT, and SIGTERM that emits `\x1b[r` (reset scroll region to full terminal) and `\x1b[?25h` (show cursor, in case it was hidden).
- **SIGKILL/crash:** The scroll region may leak. Document that `reset` or `stty sane` fixes this. In practice, most terminal emulators handle this gracefully.
- **Terminal resize (`SIGWINCH`):** Recompute header height, reset the scroll region with new bounds, repaint the header, and continue. Existing log lines remain in scrollback.
- **Header height changes:** The worker section shrinks as workers become idle. When the header gets shorter, the separator line (`---`) moves up, and the scroll region expands. One blank line is emitted in the log to visually separate the old and new scroll region boundaries.

### Completion transition

When all iterations finish:

1. Reset scroll region: `\x1b[r`
2. Move to home: `\x1b[1;1H`
3. Repaint the header one final time: workers replaced by summary lines, separator changes from `---` to `===`
4. Move cursor to the line after the last log entry
5. The terminal is left clean. The user can scroll up through the full chronological log.

### Signal handling

On SIGINT/SIGTERM:

1. Kill all in-flight child processes immediately
2. Reset scroll region: `\x1b[r`
3. Move cursor below the last log line
4. Print: `Interrupted. {N}/{total} completed, {M} in flight (discarded).`
5. Release the lockfile

### Output streams

- All live display output (header + log) goes to **stderr** (`process.stderr.write`)
- `status --json` goes to **stdout** (`process.stdout.write`)

### Performance

The header for a 6x4 matrix is ~13 lines (~2 KB). It repaints only on events (iteration completions + 1-second timer), not on a fixed 100ms tick. For a run with 240 iterations taking ~4 seconds each across 6 workers, that is roughly one header repaint every ~700ms plus the 1-second timer ticks -- well within performance bounds.

Log lines are written via normal `process.stderr.write()` and scroll naturally. There is no per-log-line overhead beyond the write itself.

---

## Tradeoffs

### What you gain

- **Real-time per-iteration visibility.** Every iteration result (duration, exit code) appears in the scrolling log as it completes. When something fails, you see it immediately with context -- no waiting for the run to finish.
- **Scrollback history.** After the run, scrolling up reveals the complete chronological record of every iteration. This is a natural audit trail that requires no separate command to access.
- **Duration awareness during the run.** The scrolling log shows durations as iterations complete. You can spot performance regressions in real time (e.g., "iterations on this ref are 2x slower than expected") without waiting for `--json` output.
- **Graceful non-TTY degradation.** The non-TTY fallback is literally the scrolling log portion of the full display. The same format works in CI, in pipes, and in terminals -- it is a subset, not a separate mode.
- **Progressive disclosure.** The header gives the shape (which cells are done, where failures are). The log gives the detail (which specific iteration, how long, what exit code). Both are on screen simultaneously without interfering with each other.

### What you give up

- **Terminal complexity.** ANSI scroll regions are the most fragile terminal mechanism in common use. A crash or SIGKILL can leave the terminal in a broken state requiring `reset`. The implementation must handle SIGWINCH (resize), cleanup on every exit path, and the edge case where the header height changes during the run.
- **Taller display.** The minimum useful display is header (9-13 lines) plus at least a few visible log lines. On a 24-line terminal with a 9-line header, that leaves 15 lines for the log -- adequate. On a 15-line terminal, the header alone consumes 9 lines, leaving only 6 for the log. Below that, the header must be dropped entirely.
- **Cognitive split.** Information lives in two places: the header (aggregate) and the log (detail). When investigating a failure, you look at the matrix to see which cell, then scan the log to find the specific iteration. This two-region design is more powerful but requires more active attention than a single grid.
- **Width pressure.** Each matrix row contains inline bars for every ref, which is wider than bare fractions. A 6x4 matrix with 10-char bars needs ~115 columns. Narrow terminals force bar compression or removal.
- **No history of the header itself.** The header is redrawn in place -- you cannot scroll up to see what the matrix looked like 5 minutes ago. The log provides temporal history, but the spatial overview (the matrix) is ephemeral.
