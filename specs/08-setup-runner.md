# Spec 08: Setup Runner

## Purpose

Run the `setup` command once per worktree before any iterations execute. Track which worktrees have been set up (by SHA) so setup is skipped on resume if the ref hasn't advanced.

## Public Interface

```typescript
interface SetupResult {
  ref: string;
  sha: string;
  success: boolean;
  durationMs: number;
  exitCode?: number;
}

/**
 * Run the setup command for each worktree that needs it.
 * Returns results for each ref. Runs sequentially (not parallelized).
 *
 * A worktree is skipped if a marker file exists with a matching SHA.
 * On success, writes a marker file. On failure, does not write marker.
 */
function runSetups(
  setupCommand: string,
  worktrees: Worktree[],
  stderr: NodeJS.WritableStream
): Promise<SetupResult[]>;

/**
 * Check if a worktree has already been set up for the given SHA.
 */
function isSetupDone(worktreePath: string, sha: string): Promise<boolean>;

/**
 * Mark a worktree as set up for the given SHA.
 */
function markSetupDone(worktreePath: string, sha: string): Promise<void>;
```

## Marker File

Path: `{worktreePath}/.chrome-ranger-setup-done`

Content: the SHA string followed by a newline (e.g., `e7f8a9b1234567890abcdef1234567890abcdef12\n`)

## Behavior

### `runSetups`

1. For each worktree (sequentially):
   a. Check `isSetupDone(worktree.path, worktree.sha)`
   b. If already done → skip, emit to stderr: `  {ref} ({shortSha})                 ✓  (cached)`
   c. If not done → run `setupCommand` via shell:
      - `cwd`: worktree path
      - Inherit no env vars beyond the standard set (PATH, HOME, etc.)
      - Capture wall-clock duration
   d. If exit code is 0 → `markSetupDone`, emit: `  {ref} ({shortSha})                 ✓  {duration}s`
   e. If exit code is non-zero → do NOT mark done, emit: `  {ref} ({shortSha})                 ✗  exit:{code}`
   f. Then emit: `  Skipping all iterations for {ref}`
2. Return all results

### `isSetupDone`

1. Read `{worktreePath}/.chrome-ranger-setup-done`
2. If file exists and content (trimmed) matches `sha` → return `true`
3. Otherwise → return `false`

### `markSetupDone`

1. Write `sha` + newline to `{worktreePath}/.chrome-ranger-setup-done`

## Edge Cases

- No `setup` command configured → `runSetups` is not called (caller handles this)
- Marker file exists but SHA differs (branch advanced) → setup re-runs
- Marker file is corrupted or empty → treated as not done, setup re-runs
- Setup command fails → ref is marked as failed, no marker written, other refs continue
- Setup command writes to stdout/stderr → not captured (inherits the parent process stderr for inline display)
- Worktree path has spaces → shell command handles it (cwd is set, not interpolated)

## Acceptance Criteria

- [ ] Setup command runs with `cwd` set to the worktree directory
- [ ] Successful setup writes marker file with SHA
- [ ] Setup skipped when marker file matches current SHA
- [ ] Setup re-runs when marker file has different SHA
- [ ] Failed setup does not write marker file
- [ ] Failed setup returns `success: false` with exit code
- [ ] Other refs continue after one ref's setup fails
- [ ] Setup runs sequentially (not in parallel)
- [ ] Duration is measured and reported
- [ ] Missing or corrupted marker file → setup runs

## Test Strategy

Use a real temp directory with a trivial setup command (e.g., `echo done`, `exit 1`). No git repo needed for the setup runner itself — just a directory path.
