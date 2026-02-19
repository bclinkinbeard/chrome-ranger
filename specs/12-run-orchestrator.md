# Spec 12: Run Orchestrator

## Purpose

Coordinate the full `run` pipeline end-to-end. This is the top-level function that the CLI `run` command calls. It sequences all phases: lock, parse, resolve, download, worktree, setup, warmup, iterate, unlock.

## Public Interface

```typescript
interface RunOptions {
  configPath: string;
  projectDir: string;
  chromeFilter?: string[];
  refsFilter?: string[];
  appendCount?: number;
  replace?: boolean;
  stderr: NodeJS.WritableStream;
}

interface RunSummary {
  total: number;
  completed: number;
  failed: number;
  skippedRefs: string[];
}

/**
 * Execute the full run pipeline.
 * This is the main entry point for `chrome-ranger run`.
 */
function executeRun(options: RunOptions): Promise<RunSummary>;
```

## Behavior — Phase by Phase

### Phase 1: Lock

1. Call `acquireLock(projectDir)`
2. If lock fails → print error, exit immediately

### Phase 2: Parse config

1. Call `loadConfig(configPath)`
2. If config fails → release lock, print error, exit

### Phase 3: Resolve refs

1. Emit to stderr: `Resolving refs...`
2. For each `code.refs` entry, call `resolveRef(code.repo, ref)`
3. Emit: `  {ref}        → {shortSha}`
4. If a ref can't be resolved → print error for that ref, exclude it from the run (other refs continue)
5. If `--refs` filter is set, only resolve those refs

### Phase 4: Worktrees

1. Emit: `Setting up worktrees...`
2. For each resolved ref, call `ensureWorktree(projectDir, ref, sha)`
3. Emit: `  {worktreePath}              ✓`

### Phase 5: Setup

1. If `setup` is configured:
   - Emit: `Running setup: {setup}`
   - Call `runSetups(setup, worktrees, stderr)`
   - Track which refs failed — they'll be excluded from the matrix
2. If `setup` is not configured → skip this phase

### Phase 6: Chrome binaries

1. Emit: `Ensuring Chrome binaries...`
2. Resolve cache dir via `resolveCacheDir(config.chrome.cache_dir)`
3. For each chrome version, call `ensureChrome(version, cacheDir)`
4. Emit: `  chrome@{version}       ✓  cached` or `✓  downloading... done ({duration}s)`
5. If download fails → print error, exclude that version (other versions continue)

### Phase 7: Compute work

1. Load existing runs via `loadRuns(projectDir)`
2. If `--replace`:
   - Call `deleteRuns()` with predicate matching targeted cells
   - Reload runs (now empty for targeted cells)
3. If `--append N`:
   - Call `computeAppend()` to get additional cells
4. Otherwise:
   - Call `generateMatrix()` + `computePending()`
5. Apply `--chrome` and `--refs` filters via `filterMatrix()`
6. Exclude refs that failed setup
7. Exclude cells for chrome versions that failed download
8. If nothing to do → emit: `Skipping {N} completed iterations.` and exit

### Phase 8: Warmup

1. If `warmup > 0`:
   - Derive unique `(chrome, ref)` cells from pending work
   - Call `runWarmups()`
   - Remove cells where warmup failed from the pending work
   - If no cells remain → exit

### Phase 9: Iterate

1. Emit: `Running {N} iterations + {W} warmup ({workers} workers)`
2. Build `PoolTask[]` from pending cells + resolved chrome paths
3. Call `runPool(tasks, options, signal)`
4. Receive `PoolResult`

### Phase 10: Summary

1. Emit: `Done. {N} runs logged to .chrome-ranger/runs.jsonl`
2. If failures: append ` ({F} failed)`
3. Release lock

### Error handling

- Each phase handles its own errors locally
- Partial failures (some refs fail, some chrome versions fail) reduce the matrix but don't abort
- The lock is ALWAYS released, even on error (use try/finally)

## Edge Cases

- All refs fail to resolve → nothing to do, release lock, exit with message
- All chrome versions fail to download → nothing to do
- All setups fail → nothing to do
- All warmups fail → nothing to do
- `--chrome` filter matches no configured versions → nothing to do
- `--refs` filter matches no configured refs → nothing to do
- Config has no `setup` → phase 5 skipped entirely
- Config has `warmup: 0` → phase 8 skipped entirely
- Resume run: most cells complete → only pending cells run

## Acceptance Criteria

- [ ] Lock acquired at start, released at end (even on error)
- [ ] Config loaded and validated
- [ ] Refs resolved and short SHAs displayed
- [ ] Worktrees created for each resolved ref
- [ ] Setup runs once per worktree when configured
- [ ] Failed setup refs excluded from matrix
- [ ] Chrome binaries downloaded/cached
- [ ] Failed chrome versions excluded from matrix
- [ ] `--replace` deletes targeted runs before computing work
- [ ] `--append N` adds N iterations beyond existing
- [ ] Default mode only runs pending cells
- [ ] `--chrome` and `--refs` filters scope all operations
- [ ] Warmup runs before real iterations when configured
- [ ] Failed warmup cells excluded from iteration
- [ ] Iterations dispatched through worker pool
- [ ] Summary line emitted with correct counts
- [ ] Lock released in all exit paths
