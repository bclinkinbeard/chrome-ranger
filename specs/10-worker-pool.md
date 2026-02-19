# Spec 10: Worker Pool

## Purpose

Execute multiple iterations concurrently up to the configured `workers` count. Manages the dispatch queue, serializes writes to `runs.jsonl`, and emits progress output. This is the parallelism layer between the orchestrator and the iteration runner.

## Public Interface

```typescript
interface PoolOptions {
  workers: number;
  command: string;
  projectDir: string;
  stderr: NodeJS.WritableStream;
}

interface PoolTask {
  cell: MatrixCell;
  chromeBin: string;
}

interface PoolResult {
  total: number;
  completed: number;
  failed: number;
}

/**
 * Run all tasks through the worker pool.
 * Dispatches up to `workers` concurrent iterations.
 * Each completed iteration is immediately written to runs.jsonl and output files.
 * Progress is emitted to stderr.
 * Returns summary counts.
 *
 * Accepts an AbortSignal to support cancellation (signal handling).
 */
function runPool(
  tasks: PoolTask[],
  options: PoolOptions,
  signal?: AbortSignal
): Promise<PoolResult>;
```

## Behavior

### `runPool`

1. Create a FIFO queue from `tasks`
2. Launch up to `options.workers` concurrent workers
3. Each worker loop:
   a. Dequeue next task (if queue empty, worker exits)
   b. Generate UUID via `crypto.randomUUID()`
   c. Call `runIteration()` with the task parameters
   d. Write stdout/stderr to output files via runs store
   e. Append `RunMeta` to `runs.jsonl` via runs store (serialized — see below)
   f. Emit progress line to stderr
   g. Loop back to (a)
4. Wait for all workers to complete
5. Return `{ total, completed (exitCode 0), failed (exitCode != 0) }`

### Serialized writes

Writes to `runs.jsonl` must be serialized to prevent interleaving. Use a simple mutex/queue pattern:
- Workers call an `appendRun` wrapper that serializes through a shared lock
- Multiple output file writes can happen concurrently (different files per run)

### Progress format

Each completed iteration emits one line to stderr:

```
  [ 3/45] chrome@120 × main (e7f8a9b) #2    4523ms  exit:0
```

Components:
- `[ 3/45]` — completed count / total, right-aligned with space padding
- `chrome@120` — major version only in progress output
- `main` — ref name
- `(e7f8a9b)` — short SHA (first 7 chars)
- `#2` — iteration number
- `4523ms` — duration from result
- `exit:0` — exit code

### Cancellation

If `signal` is aborted:
- Stop dequeuing new tasks
- Kill in-flight child processes (handled by signal module sending kill)
- Do NOT write results for in-flight iterations
- Return partial results

## Edge Cases

- `workers: 1` → serial execution (one at a time)
- `workers` > number of tasks → all tasks start immediately, no queueing
- All tasks fail → `PoolResult.failed === total`, `completed === 0`
- Empty task list → immediate return with `{ total: 0, completed: 0, failed: 0 }`
- Cancellation between tasks → clean stop, partial results returned
- Cancellation during a task → that task's result is discarded

## Acceptance Criteria

- [ ] `workers: 1` runs tasks serially (verified by timing or order)
- [ ] `workers: 2` runs at most 2 tasks concurrently
- [ ] Each completed iteration has a `runs.jsonl` entry
- [ ] Each completed iteration has `.stdout` and `.stderr` output files
- [ ] `runs.jsonl` contains valid JSON lines (no interleaving) under concurrency
- [ ] Progress lines are emitted to stderr for each completed task
- [ ] Progress shows correct counter `[N/total]`
- [ ] Progress shows major Chrome version, not full version
- [ ] Progress shows short SHA (7 chars)
- [ ] `PoolResult` counts are correct
- [ ] Empty task list → immediate return with zero counts
- [ ] AbortSignal stops processing new tasks
- [ ] No results written for tasks that were in-flight during abort

## Test Strategy

Use a trivial command (e.g., `echo test`) and a real temp directory. Verify `runs.jsonl` and output files. For concurrency testing, use a command with a small `sleep` and verify timing/overlap.
