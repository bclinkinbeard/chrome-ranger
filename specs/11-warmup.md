# Spec 11: Warmup

## Purpose

Run warmup iterations before real iterations to prime caches, JIT compilers, etc. Warmup output is completely discarded — no `runs.jsonl` entries, no output files. If a warmup fails, all real iterations for that `(chrome, ref)` cell are skipped.

## Public Interface

```typescript
interface WarmupTask {
  chrome: string;
  chromeBin: string;
  ref: string;
  sha: string;
  codeDir: string;
}

interface WarmupResult {
  /** Cells where warmup succeeded — proceed with real iterations */
  passed: Array<{ chrome: string; ref: string }>;
  /** Cells where warmup failed — skip real iterations */
  failed: Array<{ chrome: string; ref: string; exitCode: number }>;
}

/**
 * Run warmup iterations for each (chrome, ref) cell.
 * Warmup count is per cell. Dispatched through the worker pool.
 * Output is completely discarded.
 * Returns which cells passed/failed warmup.
 */
function runWarmups(
  tasks: WarmupTask[],
  warmupCount: number,
  command: string,
  workers: number,
  stderr: NodeJS.WritableStream,
  signal?: AbortSignal
): Promise<WarmupResult>;
```

## Behavior

### `runWarmups`

1. For each `(chrome, ref)` cell, create `warmupCount` warmup iterations
2. Dispatch all warmup iterations through parallel workers (reuse pool logic or direct spawn)
3. For each warmup iteration:
   a. Run the command with full environment contract (same as real iterations)
   b. Emit to stderr: `  [warmup] chrome@{major} × {ref} ({shortSha})`
   c. If exit code is non-zero → mark that cell as failed, skip remaining warmups for that cell
   d. Discard stdout and stderr completely (don't write to disk)
   e. Do NOT append to `runs.jsonl`
4. Collect results: which cells passed, which failed
5. For failed cells, emit: `  Warmup failed for chrome@{major} × {ref} — skipping iterations`

### Warmup count math

`warmup: 1` with a 2×2 matrix (2 chrome versions × 2 refs) = 4 warmup iterations total (1 per cell).

`warmup: 3` with a 2×2 matrix = 12 warmup iterations total (3 per cell).

### Ordering

All warmup iterations run before any real iterations. The orchestrator calls `runWarmups` first, then uses the `passed` list to filter the real iteration matrix.

## Edge Cases

- `warmup: 0` → `runWarmups` is not called (caller handles this)
- First warmup iteration of a cell fails → remaining warmups for that cell are skipped
- Warmup failure for one cell doesn't affect other cells
- `warmup: 1` with 1 chrome × 1 ref = 1 warmup iteration total
- All warmups fail → all cells in `failed`, no real iterations run
- Warmup command produces output → output is discarded, not written anywhere

## Acceptance Criteria

- [ ] Warmup iterations run before real iterations
- [ ] Warmup count is per `(chrome, ref)` cell
- [ ] `warmup: 1` with 2×2 matrix = 4 warmup iterations
- [ ] No `runs.jsonl` entries for warmup iterations
- [ ] No output files for warmup iterations
- [ ] Warmup failure marks the cell as failed
- [ ] Failed cell's remaining warmups are skipped
- [ ] Other cells continue after one cell's warmup fails
- [ ] Progress lines use `[warmup]` label, no duration or exit code
- [ ] Failed cells are reported to stderr
- [ ] `WarmupResult.passed` contains only cells where all warmups succeeded
- [ ] `WarmupResult.failed` contains cells where any warmup failed

## Test Strategy

Use `echo ok` for passing warmups, `exit 1` for failing warmups. Verify no files are created in the output directory or `runs.jsonl`. Verify that the returned `passed`/`failed` lists are correct.
