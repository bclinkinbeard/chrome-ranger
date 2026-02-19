# Spec 13: Signal Handling

## Purpose

Handle SIGINT and SIGTERM gracefully during a run. Kill in-flight iterations immediately, discard partial results, and release the lockfile. The commit point is the flush to `runs.jsonl` — completed writes stay, in-flight writes are discarded.

## Public Interface

```typescript
/**
 * Install signal handlers for SIGINT and SIGTERM.
 * Returns an AbortController whose signal should be passed to the worker pool.
 * When a signal is received:
 *   1. Abort the controller (stops new task dispatch)
 *   2. Kill child processes via the provided cleanup function
 *   3. Release the lockfile
 *   4. Exit with code 130 (SIGINT) or 143 (SIGTERM)
 */
function installSignalHandlers(
  projectDir: string,
  cleanup: () => void
): AbortController;

/**
 * Remove signal handlers (call after run completes normally).
 */
function removeSignalHandlers(): void;
```

## Behavior

### Signal flow

1. Orchestrator calls `installSignalHandlers(projectDir, cleanup)` before starting work
2. The returned `AbortController` is threaded through to the worker pool
3. When SIGINT or SIGTERM arrives:
   a. The handler calls `controller.abort()`
   b. This causes the worker pool to stop dequeuing new tasks
   c. The handler calls `cleanup()` which kills in-flight child processes
   d. The handler calls `releaseLock(projectDir)`
   e. The process exits with the conventional code:
      - SIGINT → exit code 130
      - SIGTERM → exit code 143
4. If a second signal arrives while handling the first → force exit immediately (`process.exit()`)

### Data integrity

- Any `RunMeta` that was fully flushed to `runs.jsonl` before the signal → stays (it's on disk)
- Any `RunMeta` that was not yet flushed → discarded (the iteration result is lost)
- Output files that were fully written → stay
- Output files that were partially written → may be incomplete, but the corresponding `runs.jsonl` entry determines validity

### Double signal

On the first signal, the handler sets a flag. If a second signal arrives while cleanup is in progress, call `process.exit(1)` immediately — don't wait for graceful cleanup.

## Edge Cases

- Signal during setup phase → kill setup process, release lock, exit
- Signal during warmup → kill warmup process, release lock, exit
- Signal during iteration → kill iteration process, don't write that result
- Signal when no work is in progress → just release lock and exit
- Signal after all work is done (during summary) → release lock and exit
- `releaseLock` fails during signal handler → still exit (don't hang)
- Multiple rapid SIGINTs (e.g., user mashing Ctrl+C) → second one force-exits

## Acceptance Criteria

- [ ] SIGINT triggers abort of worker pool
- [ ] SIGTERM triggers abort of worker pool
- [ ] In-flight child processes are killed on signal
- [ ] Lockfile is released on signal
- [ ] Exit code is 130 for SIGINT
- [ ] Exit code is 143 for SIGTERM
- [ ] Already-flushed `runs.jsonl` entries survive
- [ ] In-flight iterations do not produce `runs.jsonl` entries
- [ ] Double signal causes immediate exit
- [ ] Signal handlers are removed after normal completion

## Test Strategy

Signal handling is inherently difficult to unit test. Recommended approach:
- Integration test: launch `chrome-ranger run` as a child process with a slow command (`sleep 10`), send SIGINT, verify lock is released and exit code is 130
- Unit test the `AbortController` wiring: verify that `abort()` stops the pool from dequeuing
