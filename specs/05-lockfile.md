# Spec 05: Lockfile

## Purpose

Prevent concurrent `chrome-ranger run` processes against the same project. The lockfile is a simple PID-based file lock at `.chrome-ranger/lock`.

## Public Interface

```typescript
/**
 * Acquire the project lockfile. Writes the current PID to the file.
 * Throws LockError if another live process holds the lock.
 * Reclaims stale locks (PID no longer alive).
 */
function acquireLock(projectDir: string): Promise<void>;

/**
 * Release the project lockfile. Removes the lock file.
 * No-op if the lock doesn't exist (idempotent).
 */
function releaseLock(projectDir: string): Promise<void>;

class LockError extends Error {
  constructor(message: string);
}
```

## File Format

The lock file at `{projectDir}/.chrome-ranger/lock` contains the PID of the owning process as a plain text integer, followed by a newline.

Example content: `12345\n`

## Behavior

### `acquireLock`

1. Ensure `.chrome-ranger/` directory exists
2. Try to read the existing lock file
3. If no lock file exists:
   - Write current PID to the lock file using exclusive creation (`O_CREAT | O_EXCL`) to avoid TOCTOU races
   - If the exclusive write fails because the file was created between steps 2 and 3, re-read and proceed to step 4
4. If lock file exists:
   - Read PID from file
   - Check if that PID is alive (`process.kill(pid, 0)` — signal 0 tests existence)
   - If PID is alive → throw `LockError`: `Another chrome-ranger process (PID {pid}) is running against this project`
   - If PID is dead → stale lock. Delete it, then write current PID (using exclusive create)
   - If PID can't be parsed → treat as stale, reclaim

### `releaseLock`

1. Remove `{projectDir}/.chrome-ranger/lock`
2. If file doesn't exist, do nothing (no error)

## Edge Cases

- Lock file exists but PID is dead (crash) → reclaimed automatically
- Lock file contains garbage (not a number) → treated as stale, reclaimed
- Lock file is empty → treated as stale, reclaimed
- `.chrome-ranger/` directory doesn't exist → created during acquire
- Two processes race to acquire → only one wins due to O_EXCL
- `releaseLock` called when no lock exists → no error

## Acceptance Criteria

- [ ] `acquireLock` creates lock file with current PID
- [ ] `acquireLock` succeeds when no lock exists
- [ ] `acquireLock` throws `LockError` when another live process holds the lock
- [ ] `acquireLock` reclaims lock when PID in lock file is dead
- [ ] `acquireLock` reclaims lock when lock file contains non-numeric content
- [ ] `acquireLock` reclaims lock when lock file is empty
- [ ] `acquireLock` creates `.chrome-ranger/` if missing
- [ ] `releaseLock` removes the lock file
- [ ] `releaseLock` is idempotent (no error if lock doesn't exist)
- [ ] Error message includes the PID of the blocking process
