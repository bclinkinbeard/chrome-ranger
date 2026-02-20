# Status Visualization Options

Exploration of richer status visualizations for chrome-ranger, both during a run (`run` command live output) and after (`status` command). Each option is shown in multiple states so you can see how it behaves across the lifecycle.

**Matrix used in all examples** (unless noted otherwise):

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

That's a 3×3 matrix = 9 cells × 5 iterations = 45 total runs + 9 warmups.

---

## Part 1: During-Run Visualizations

These replace or augment the current line-by-line progress output while `chrome-ranger run` is executing.

---

### Option A: Live Matrix Grid

A matrix that redraws in-place, showing per-cell progress. Each cell updates as iterations complete. Uses terminal cursor control (ANSI escape sequences) to overwrite previous output.

**Early — 6 of 45 iterations done, warmup finished:**

```
chrome-ranger run — 6/45 iterations (13%)  ⡿  2 workers active

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ██░░░░░░░░ 2/5    ██░░░░░░░░ 2/5      ░░░░░░░░░░ 0/5
Chrome 121       ██░░░░░░░░ 2/5    ░░░░░░░░░░ 0/5      ░░░░░░░░░░ 0/5
Chrome 122       ░░░░░░░░░░ 0/5    ░░░░░░░░░░ 0/5      ░░░░░░░░░░ 0/5

Workers:
  #1  chrome@120 × v4.5.0 (c3d4e5f) #2          3.1s elapsed
  #2  chrome@121 × main (e7f8a9b) #2             1.8s elapsed
  #3  idle
  #4  idle
```

**Mid-run — 28 of 45 done, one failure:**

```
chrome-ranger run — 28/45 iterations (62%)  ⡿  4 workers active

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ██████████ 5/5 ✓  ██████████ 5/5 ✓    ████████░░ 4/5 ✗1
Chrome 121       ██████████ 5/5 ✓  ██████░░░░ 3/5      ██░░░░░░░░ 1/5
Chrome 122       ████████░░ 4/5    ░░░░░░░░░░ 0/5      ██░░░░░░░░ 1/5

Workers:
  #1  chrome@121 × v4.5.0 (c3d4e5f) #3          2.4s elapsed
  #2  chrome@121 × feature/virtual-list #1       4.1s elapsed
  #3  chrome@122 × main (e7f8a9b) #4             0.6s elapsed
  #4  chrome@122 × feature/virtual-list #1       3.2s elapsed
```

**Complete — all 45 done, 2 failures:**

```
chrome-ranger run — 45/45 iterations (100%)  done in 3m 22s

                  main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ██████████ 5/5 ✓  ██████████ 5/5 ✓    ██████████ 4/5 ✗1
Chrome 121       ██████████ 5/5 ✓  ██████████ 5/5 ✓    ██████████ 5/5 ✓
Chrome 122       ██████████ 5/5 ✓  ██████████ 5/5 ✓    ██████████ 4/5 ✗1

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

**Pros:** At-a-glance progress for every cell; shows which cells are slow or stuck.
**Cons:** Requires terminal cursor control; breaks if piped to a file; needs a fallback mode.

---

### Option B: Compact Progress Bar + Recent Activity

A single overall progress bar at the top, plus a rolling log of the most recent completions. No cursor rewriting — works with pipes and file redirection.

**Early:**

```
 ▐████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▌  6/45  13%

  chrome@120 × main (e7f8a9b) #1                    4210ms  exit:0
  chrome@120 × v4.5.0 (c3d4e5f) #0                  3891ms  exit:0
  chrome@120 × main (e7f8a9b) #0                     4523ms  exit:0
```

**Mid-run with failures:**

```
 ▐██████████████████████████░░░░░░░░░░░░░░░░░░▌  28/45  62%  (1 failed)

  chrome@121 × main (e7f8a9b) #4                    4102ms  exit:0
  chrome@120 × feature/virtual-list (a1b2c3d) #3    2455ms  exit:1  ← FAIL
  chrome@122 × main (e7f8a9b) #3                    4198ms  exit:0
  chrome@121 × v4.5.0 (c3d4e5f) #2                  3344ms  exit:0
  chrome@122 × feature/virtual-list (a1b2c3d) #0    2210ms  exit:0
```

**Complete:**

```
 ▐██████████████████████████████████████████████▌  45/45  100%  done in 3m 22s

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

**Pros:** Simple, no cursor tricks, works everywhere, streaming-friendly.
**Cons:** No per-cell visibility until completion; failures scroll away.

---

### Option C: Phase-Grouped Live View

Groups output by cell, showing each cell's iterations together. The currently-active cell block updates in place; completed cells stay printed above.

**Mid-run:**

```
chrome@120 × main (e7f8a9b)
  ✓ #0  4523ms   ✓ #1  4210ms   ✓ #2  4102ms   ✓ #3  4198ms   ✓ #4  4301ms

chrome@120 × v4.5.0 (c3d4e5f)
  ✓ #0  3891ms   ✓ #1  3744ms   ✓ #2  3802ms   ✓ #3  3955ms   ✓ #4  3688ms

chrome@120 × feature/virtual-list (a1b2c3d)
  ✓ #0  2301ms   ✓ #1  2455ms   ✓ #2  2189ms   ✗ #3  2891ms   ⡿ #4  1.2s...

chrome@121 × main (e7f8a9b)
  ✓ #0  4102ms   ⡿ #1  0.8s...   · #2   · #3   · #4
```

**Complete with failures:**

```
chrome@120 × main (e7f8a9b)                                        5/5 ✓
  ✓ #0  4523ms   ✓ #1  4210ms   ✓ #2  4102ms   ✓ #3  4198ms   ✓ #4  4301ms

chrome@120 × v4.5.0 (c3d4e5f)                                      5/5 ✓
  ✓ #0  3891ms   ✓ #1  3744ms   ✓ #2  3802ms   ✓ #3  3955ms   ✓ #4  3688ms

chrome@120 × feature/virtual-list (a1b2c3d)                        4/5 ✗
  ✓ #0  2301ms   ✓ #1  2455ms   ✓ #2  2189ms   ✗ #3  2891ms   ✓ #4  2210ms

chrome@121 × main (e7f8a9b)                                        5/5 ✓
  ✓ #0  4102ms   ✓ #1  4198ms   ✓ #2  3999ms   ✓ #3  4301ms   ✓ #4  4088ms

chrome@121 × v4.5.0 (c3d4e5f)                                      5/5 ✓
  ✓ #0  3344ms   ✓ #1  3291ms   ✓ #2  3402ms   ✓ #3  3188ms   ✓ #4  3299ms

chrome@121 × feature/virtual-list (a1b2c3d)                        5/5 ✓
  ✓ #0  2102ms   ✓ #1  2344ms   ✓ #2  2211ms   ✓ #3  2189ms   ✓ #4  2098ms

chrome@122 × main (e7f8a9b)                                        5/5 ✓
  ✓ #0  4198ms   ✓ #1  4088ms   ✓ #2  4301ms   ✓ #3  4102ms   ✓ #4  4210ms

chrome@122 × v4.5.0 (c3d4e5f)                                      5/5 ✓
  ✓ #0  3688ms   ✓ #1  3802ms   ✓ #2  3591ms   ✓ #3  3744ms   ✓ #4  3655ms

chrome@122 × feature/virtual-list (a1b2c3d)                        4/5 ✗
  ✓ #0  2210ms   ✓ #1  2098ms   ✗ #2  2891ms   ✓ #3  2189ms   ✓ #4  2301ms

Done. 45 runs logged to .chrome-ranger/runs.jsonl (2 failed)
```

**Pros:** Every individual iteration visible; easy to spot outlier durations; natural grouping.
**Cons:** Tall output for large matrices; lots of information density; awkward with high parallelism (cells interleave).

---

### Option D: Hybrid — Matrix Header + Scrolling Log

Keeps a pinned matrix summary at the top of the terminal (redrawn in-place) with a scrolling log of completions below. Uses a split-pane effect via ANSI cursor positioning.

**Mid-run:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  28/45 iterations  62%  ████████████████████░░░░░░░░░░░░  1 failed │
│                                                                     │
│                main       v4.5.0     feature/virtual-list           │
│  Chrome 120    5/5 ✓      5/5 ✓      4/5 ✗                         │
│  Chrome 121    5/5 ✓      3/5 ◌      1/5 ◌                         │
│  Chrome 122    4/5 ◌      0/5 ·      1/5 ◌                         │
└─────────────────────────────────────────────────────────────────────┘
  [25/45] chrome@122 × main (e7f8a9b) #3             4102ms  exit:0
  [26/45] chrome@121 × v4.5.0 (c3d4e5f) #2           3402ms  exit:0
  [27/45] chrome@121 × feature/virtual-list #0        2102ms  exit:0
  [28/45] chrome@122 × feature/virtual-list #1        2344ms  exit:0
```

Key: `✓` complete, `◌` in progress, `·` not started, `✗` has failures

**Pros:** Best of both worlds — overview + detail. Very natural for monitoring.
**Cons:** Most complex to implement; requires careful terminal handling.

---

## Part 2: Post-Run Status Visualizations (`chrome-ranger status`)

These are for the `status` command, displaying a snapshot of completed/failed runs.

---

### Option 1: Current Design (Baseline)

The design from DESIGN.md. Simple, minimal, aligned columns.

**All complete:**

```
$ chrome-ranger status

                        main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120.0.6099.109  5/5 ✓             5/5 ✓               5/5 ✓
Chrome 121.0.6167.85   5/5 ✓             5/5 ✓               5/5 ✓
Chrome 122.0.6261.94   5/5 ✓             5/5 ✓               5/5 ✓
```

**Mixed failures:**

```
$ chrome-ranger status

                        main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120.0.6099.109  5/5 ✓             5/5 ✓               4/5 ✗ (1 failed)
Chrome 121.0.6167.85   5/5 ✓             5/5 ✓               5/5 ✓
Chrome 122.0.6261.94   5/5 ✓             5/5 ✓               4/5 ✗ (1 failed)
```

**Empty:**

```
$ chrome-ranger status

                        main (e7f8a9b)   v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120.0.6099.109  0/5               0/5                 0/5
Chrome 121.0.6167.85   0/5               0/5                 0/5
Chrome 122.0.6261.94   0/5               0/5                 0/5
```

---

### Option 2: Bar Chart Cells

Replace counts with inline horizontal bars. Bar width is proportional to completion.

**All complete:**

```
$ chrome-ranger status

                  main (e7f8a9b)     v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       █████ 5/5 ✓         █████ 5/5 ✓         █████ 5/5 ✓
Chrome 121       █████ 5/5 ✓         █████ 5/5 ✓         █████ 5/5 ✓
Chrome 122       █████ 5/5 ✓         █████ 5/5 ✓         █████ 5/5 ✓
```

**Mid-run:**

```
$ chrome-ranger status

                  main (e7f8a9b)     v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       █████ 5/5 ✓         █████ 5/5 ✓         ████░ 4/5 ✗1
Chrome 121       █████ 5/5 ✓         ███░░ 3/5           █░░░░ 1/5
Chrome 122       ████░ 4/5           ░░░░░ 0/5           █░░░░ 1/5
```

**With --append (over-filled cells):**

```
$ chrome-ranger status

                  main (e7f8a9b)     v4.5.0 (c3d4e5f)   feature/virtual-list (a1b2c3d)
Chrome 120       ████████ 8/5 ✓      █████ 5/5 ✓         █████ 5/5 ✓
Chrome 121       █████ 5/5 ✓         █████ 5/5 ✓         ███████ 7/5 ✓
Chrome 122       █████ 5/5 ✓         █████ 5/5 ✓         █████ 5/5 ✓
```

**Pros:** Instant visual scan of overall completion shape.
**Cons:** Takes more horizontal space; bars may be visually noisy for small matrices.

---

### Option 3: Block Heat Map

Uses Unicode block characters to show a compact density view. Each cell is a single character. Good for large matrices.

**Legend:** `█` = complete, `▓` = >50%, `▒` = >0%, `░` = empty, `✗` = has failures

**All complete (3×3):**

```
$ chrome-ranger status

            main     v4.5.0   feat/vl
Chrome 120   █        █        █       5/5 ✓  5/5 ✓  5/5 ✓
Chrome 121   █        █        █       5/5 ✓  5/5 ✓  5/5 ✓
Chrome 122   █        █        █       5/5 ✓  5/5 ✓  5/5 ✓

█ complete  ▓ >50%  ▒ started  ░ empty  ✗ failed
```

**Large matrix (6 Chrome versions × 5 refs) — mid-run:**

```
$ chrome-ranger status

             main  v4.5  v5.0  feat/a  feat/b
Chrome 118    █     █     █      █       ▓
Chrome 119    █     █     █      ▓       ▒
Chrome 120    █     █     ▓      ▒       ░
Chrome 121    █     ▓     ▒      ░       ░
Chrome 122    ▓     ▒     ░      ░       ░
Chrome 123    ▒     ░     ░      ░       ░

  18/150 complete (12%)

█ complete  ▓ >50%  ▒ started  ░ empty
```

**Large matrix — with failures:**

```
$ chrome-ranger status

             main  v4.5  v5.0  feat/a  feat/b
Chrome 118    █     █     █      █       █
Chrome 119    █     █     █      ✗       █
Chrome 120    █     █     ✗      █       █
Chrome 121    █     █     █      █       ✗
Chrome 122    █     █     █      █       █
Chrome 123    █     █     █      █       █

  147/150 complete (98%), 3 cells with failures

█ complete  ✗ has failures
```

**Pros:** Scales beautifully to large matrices; immediate pattern recognition.
**Cons:** Loses count precision; need to read the legend; not colorblind-safe without color AND shape.

---

### Option 4: Detailed Summary Cards

Groups information by Chrome version (or ref), showing per-cell stats including pass/fail counts, timing ranges, and completion bars.

**All complete:**

```
$ chrome-ranger status

Chrome 120.0.6099.109
  main (e7f8a9b)                  5/5 ✓  ██████████  3688–4523ms  avg 4067ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3591–3955ms  avg 3755ms
  feature/virtual-list (a1b2c3d)  5/5 ✓  ██████████  2098–2455ms  avg 2249ms

Chrome 121.0.6167.85
  main (e7f8a9b)                  5/5 ✓  ██████████  3999–4301ms  avg 4138ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3188–3402ms  avg 3305ms
  feature/virtual-list (a1b2c3d)  5/5 ✓  ██████████  2098–2344ms  avg 2189ms

Chrome 122.0.6261.94
  main (e7f8a9b)                  5/5 ✓  ██████████  4088–4301ms  avg 4180ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3591–3802ms  avg 3696ms
  feature/virtual-list (a1b2c3d)  5/5 ✓  ██████████  2098–2301ms  avg 2180ms

45/45 complete
```

**Mixed failures:**

```
$ chrome-ranger status

Chrome 120.0.6099.109
  main (e7f8a9b)                  5/5 ✓  ██████████  3688–4523ms  avg 4067ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3591–3955ms  avg 3755ms
  feature/virtual-list (a1b2c3d)  4/5 ✗  ████████░░  2098–2455ms  avg 2249ms  (1 failed)

Chrome 121.0.6167.85
  main (e7f8a9b)                  5/5 ✓  ██████████  3999–4301ms  avg 4138ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3188–3402ms  avg 3305ms
  feature/virtual-list (a1b2c3d)  5/5 ✓  ██████████  2098–2344ms  avg 2189ms

Chrome 122.0.6261.94
  main (e7f8a9b)                  5/5 ✓  ██████████  4088–4301ms  avg 4180ms
  v4.5.0 (c3d4e5f)               5/5 ✓  ██████████  3591–3802ms  avg 3696ms
  feature/virtual-list (a1b2c3d)  4/5 ✗  ████████░░  2098–2301ms  avg 2180ms  (1 failed)

43/45 complete, 2 failed
```

**Pros:** Rich information at a glance; timing data is useful for benchmarks; natural grouping.
**Cons:** Verbose for large matrices; mixes concerns (status should be counts, not stats?).

---

### Option 5: Bordered Table

Uses box-drawing characters for a clean, structured table. Easier to read when columns are wide.

**All complete:**

```
$ chrome-ranger status

┌────────────┬─────────────────┬──────────────────┬──────────────────────────────┐
│            │ main (e7f8a9b)  │ v4.5.0 (c3d4e5f) │ feature/virtual-list (a1b2c3d) │
├────────────┼─────────────────┼──────────────────┼──────────────────────────────┤
│ Chrome 120 │     5/5 ✓       │     5/5 ✓        │          5/5 ✓               │
│ Chrome 121 │     5/5 ✓       │     5/5 ✓        │          5/5 ✓               │
│ Chrome 122 │     5/5 ✓       │     5/5 ✓        │          5/5 ✓               │
└────────────┴─────────────────┴──────────────────┴──────────────────────────────┘
```

**Mid-run:**

```
$ chrome-ranger status

┌────────────┬─────────────────┬──────────────────┬──────────────────────────────┐
│            │ main (e7f8a9b)  │ v4.5.0 (c3d4e5f) │ feature/virtual-list (a1b2c3d) │
├────────────┼─────────────────┼──────────────────┼──────────────────────────────┤
│ Chrome 120 │     5/5 ✓       │     5/5 ✓        │       4/5 ✗ (1 failed)       │
│ Chrome 121 │     5/5 ✓       │     3/5          │          1/5                  │
│ Chrome 122 │     4/5         │     0/5          │          1/5                  │
└────────────┴─────────────────┴──────────────────┴──────────────────────────────┘

  28/45 complete (62%), 1 failed
```

**Empty:**

```
$ chrome-ranger status

┌────────────┬─────────────────┬──────────────────┬──────────────────────────────┐
│            │ main (e7f8a9b)  │ v4.5.0 (c3d4e5f) │ feature/virtual-list (a1b2c3d) │
├────────────┼─────────────────┼──────────────────┼──────────────────────────────┤
│ Chrome 120 │     0/5         │     0/5          │          0/5                  │
│ Chrome 121 │     0/5         │     0/5          │          0/5                  │
│ Chrome 122 │     0/5         │     0/5          │          0/5                  │
└────────────┴─────────────────┴──────────────────┴──────────────────────────────┘

  No runs yet.
```

**Pros:** Clean structure; familiar table format; easy to parse visually.
**Cons:** Box-drawing chars can break in some terminals or fonts; wider output.

---

### Option 6: Sparkline Cells

Each cell shows a sparkline of iteration durations, giving a quick visual of consistency/variance alongside completion counts.

**All complete:**

```
$ chrome-ranger status

                  main (e7f8a9b)          v4.5.0 (c3d4e5f)        feature/virtual-list (a1b2c3d)
Chrome 120       5/5 ✓ ▃▅▄▃▅  4.1s avg   5/5 ✓ ▄▃▄▅▃  3.8s avg   5/5 ✓ ▂▃▂▂▃  2.2s avg
Chrome 121       5/5 ✓ ▄▅▃▅▄  4.1s avg   5/5 ✓ ▃▃▄▃▃  3.3s avg   5/5 ✓ ▂▃▂▂▂  2.2s avg
Chrome 122       5/5 ✓ ▅▄▅▄▅  4.2s avg   5/5 ✓ ▃▄▃▃▄  3.7s avg   5/5 ✓ ▂▂▃▂▂  2.2s avg
```

**With failures (failed iterations shown as `▁` at baseline):**

```
$ chrome-ranger status

                  main (e7f8a9b)          v4.5.0 (c3d4e5f)        feature/virtual-list (a1b2c3d)
Chrome 120       5/5 ✓ ▃▅▄▃▅  4.1s avg   5/5 ✓ ▄▃▄▅▃  3.8s avg   4/5 ✗ ▂▃▂✗▃  2.2s avg
Chrome 121       5/5 ✓ ▄▅▃▅▄  4.1s avg   5/5 ✓ ▃▃▄▃▃  3.3s avg   5/5 ✓ ▂▃▂▂▂  2.2s avg
Chrome 122       5/5 ✓ ▅▄▅▄▅  4.2s avg   5/5 ✓ ▃▄▃▃▄  3.7s avg   4/5 ✗ ▂▂✗▂▂  2.2s avg
```

**High variance (shows an outlier clearly):**

```
                  main (e7f8a9b)
Chrome 120       5/5 ✓ ▃▃█▃▃  4.1s avg   ← iteration #2 was a 9.8s outlier
```

**Pros:** Duration data inline; outliers jump out visually; helps benchmark workflows.
**Cons:** Complex to render; sparkline precision is limited; information overload for simple pass/fail use cases.

---

### Option 7: Grouped by Ref (Transposed)

Same data as Option 1, but transposed — refs as rows, Chrome versions as columns. Better when you have many Chrome versions but few refs.

**All complete:**

```
$ chrome-ranger status

                                    Chrome 120   Chrome 121   Chrome 122
main (e7f8a9b)                      5/5 ✓        5/5 ✓        5/5 ✓
v4.5.0 (c3d4e5f)                    5/5 ✓        5/5 ✓        5/5 ✓
feature/virtual-list (a1b2c3d)      5/5 ✓        5/5 ✓        5/5 ✓
```

**Mid-run with failures:**

```
$ chrome-ranger status

                                    Chrome 120   Chrome 121   Chrome 122
main (e7f8a9b)                      5/5 ✓        5/5 ✓        4/5
v4.5.0 (c3d4e5f)                    5/5 ✓        3/5          0/5
feature/virtual-list (a1b2c3d)      4/5 ✗1       1/5          1/5

  28/45 complete (62%), 1 failed
```

**Pros:** Naturally reads left-to-right across Chrome versions for a given ref; better for many-versions-few-refs.
**Cons:** Column headers get long with full version strings; inconsistent with a Chrome-version-is-the-row convention.

---

## Part 3: Specialized Views

Additional views that could be invoked with flags or as separate subcommands.

---

### `status --timeline`

Shows when runs happened chronologically. Useful for understanding execution order and timing.

```
$ chrome-ranger status --timeline

2026-02-18 10:30    ━━━ chrome@120 × main #0         4.5s  ✓
2026-02-18 10:30    ━━━ chrome@120 × v4.5.0 #0       3.9s  ✓
2026-02-18 10:30        ━━━ chrome@120 × main #1      4.2s  ✓
2026-02-18 10:31    ━━━━ chrome@121 × main #0         4.1s  ✓
2026-02-18 10:31      ━━ chrome@120 × v4.5.0 #1       3.7s  ✓
2026-02-18 10:31        ━━━ chrome@120 × feat/vl #0   2.3s  ✓
2026-02-18 10:31            ━ chrome@120 × feat/vl #1 2.5s  ✗
            ...
```

---

### `status --failures`

Focused failure report. Lists just the failed cells with stderr excerpts.

```
$ chrome-ranger status --failures

2 cells with failures:

Chrome 120.0.6099.109 × feature/virtual-list (a1b2c3d)
  iteration #3  exit:1  2891ms
  stderr: Error: Timed out waiting for selector "tr:nth-child(1000)"
          at bench.spec.ts:5:15

Chrome 122.0.6261.94 × feature/virtual-list (a1b2c3d)
  iteration #2  exit:1  2891ms
  stderr: Error: Timed out waiting for selector "tr:nth-child(1000)"
          at bench.spec.ts:5:15

Run `chrome-ranger run --refs feature/virtual-list` to retry failed cells.
```

---

### `status --json`

Machine-readable output for scripting.

```
$ chrome-ranger status --json | jq .

{
  "matrix": {
    "chrome": ["120.0.6099.109", "121.0.6167.85", "122.0.6261.94"],
    "refs": [
      {"ref": "main", "sha": "e7f8a9b"},
      {"ref": "v4.5.0", "sha": "c3d4e5f"},
      {"ref": "feature/virtual-list", "sha": "a1b2c3d"}
    ]
  },
  "cells": [
    {"chrome": "120.0.6099.109", "ref": "main", "sha": "e7f8a9b", "target": 5, "passed": 5, "failed": 0},
    {"chrome": "120.0.6099.109", "ref": "v4.5.0", "sha": "c3d4e5f", "target": 5, "passed": 5, "failed": 0},
    {"chrome": "120.0.6099.109", "ref": "feature/virtual-list", "sha": "a1b2c3d", "target": 5, "passed": 4, "failed": 1},
    ...
  ],
  "summary": {
    "total": 45,
    "passed": 43,
    "failed": 2,
    "remaining": 0
  }
}
```

---

## Part 4: Recommendation

### During Run

**Recommended: Option D (Hybrid) with Option B fallback.**

Option D gives the best monitoring experience for interactive terminals — you see both the big picture (matrix header) and the detail (scrolling log). When output is piped or the terminal doesn't support cursor control, fall back to Option B (progress bar + log), which works everywhere.

Detection is straightforward: check `process.stderr.isTTY` and `process.stderr.columns`.

### Post-Run Status

**Recommended: Option 2 (Bar Chart Cells) as default, with Option 6 (Sparklines) behind `--detail`.**

Option 2 hits the sweet spot: it's compact, scannable, and gives completion shape at a glance without being noisy. For users who want timing data, `--detail` switches to sparklines.

Keep Option 1 (current plain table) available as the `--plain` output for scripts and accessibility.

### Additional Views

All three specialized views (`--timeline`, `--failures`, `--json`) are independently useful and don't conflict. `--json` in particular should be implemented early since it enables composability.

### Summary of Suggested Defaults

| Context | Default | Flag alternatives |
|---|---|---|
| `run` (interactive TTY) | Option D: Hybrid matrix + log | `--quiet` suppresses matrix header |
| `run` (piped / non-TTY) | Option B: Progress bar + log | n/a |
| `status` | Option 2: Bar chart cells | `--detail` for sparklines, `--plain` for minimal, `--json` for machine |
| `status --failures` | Failure report with stderr | n/a |
| `status --timeline` | Chronological run view | n/a |
