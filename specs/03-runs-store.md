# Spec 03: Runs Store

## Purpose

Read and write run metadata (`runs.jsonl`) and manage output files (`{id}.stdout`, `{id}.stderr`). This module owns all I/O for the `.chrome-ranger/` data directory — no other module touches these files directly.

## Public Interface

### Types

Re-export from `types.ts`:

```typescript
interface RunMeta {
  id: string;
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
  timestamp: string;   // ISO 8601 UTC
  durationMs: number;
  exitCode: number;
}
```

### Functions

```typescript
/**
 * Ensure .chrome-ranger/ and .chrome-ranger/output/ directories exist.
 */
function ensureDataDir(projectDir: string): Promise<void>;

/**
 * Read all run metadata from runs.jsonl.
 * Returns empty array if file doesn't exist.
 */
function loadRuns(projectDir: string): Promise<RunMeta[]>;

/**
 * Append a single run metadata entry to runs.jsonl.
 * Serializes writes — safe to call from concurrent workers
 * as long as calls are funneled through a single writer.
 */
function appendRun(projectDir: string, run: RunMeta): Promise<void>;

/**
 * Write stdout content for a run to .chrome-ranger/output/{id}.stdout
 */
function writeStdout(projectDir: string, id: string, content: string): Promise<void>;

/**
 * Write stderr content for a run to .chrome-ranger/output/{id}.stderr
 */
function writeStderr(projectDir: string, id: string, content: string): Promise<void>;

/**
 * Delete specific runs from runs.jsonl and their output files.
 * Used by --replace. Returns the rewritten runs list.
 */
function deleteRuns(projectDir: string, predicate: (run: RunMeta) => boolean): Promise<RunMeta[]>;
```

### File Paths

```typescript
function runsJsonlPath(projectDir: string): string;
// → {projectDir}/.chrome-ranger/runs.jsonl

function stdoutPath(projectDir: string, id: string): string;
// → {projectDir}/.chrome-ranger/output/{id}.stdout

function stderrPath(projectDir: string, id: string): string;
// → {projectDir}/.chrome-ranger/output/{id}.stderr
```

## Behavior

### `loadRuns`

1. Construct path: `{projectDir}/.chrome-ranger/runs.jsonl`
2. If file doesn't exist, return `[]`
3. Read file, split by newlines, filter empty lines
4. Parse each line as JSON into `RunMeta`
5. If any line fails to parse, skip it (log warning to stderr if `DEBUG=chrome-ranger`)

### `appendRun`

1. Serialize `run` to JSON (single line, no pretty-print)
2. Append to `runs.jsonl` with a trailing newline
3. Use `fs.appendFile` — atomic at the OS level for small writes

### `deleteRuns`

1. Load all runs
2. Partition into keep/delete using the predicate (predicate returns `true` for runs to delete)
3. For each deleted run: remove `{id}.stdout` and `{id}.stderr` (ignore if missing)
4. Rewrite `runs.jsonl` with only the kept runs
5. Return the kept runs

### Output file writes

- `writeStdout` and `writeStderr` write the full content to the respective file
- Files are created if they don't exist, overwritten if they do
- Empty content → empty file (not skipped)

## Edge Cases

- `runs.jsonl` doesn't exist yet → `loadRuns` returns `[]`, `appendRun` creates it
- `runs.jsonl` is empty → returns `[]`
- `runs.jsonl` has a trailing newline → no phantom empty entry
- A corrupted line in `runs.jsonl` → skip that line, don't fail
- `deleteRuns` with a predicate matching nothing → file unchanged
- `deleteRuns` with a predicate matching everything → file is empty (or removed)
- Output files for a deleted run don't exist → no error during `deleteRuns`

## Acceptance Criteria

- [ ] `ensureDataDir` creates `.chrome-ranger/` and `.chrome-ranger/output/` if they don't exist
- [ ] `ensureDataDir` is idempotent (no error if directories exist)
- [ ] `loadRuns` returns `[]` when `runs.jsonl` doesn't exist
- [ ] `loadRuns` returns `[]` for an empty file
- [ ] `loadRuns` parses valid JSONL and returns `RunMeta[]`
- [ ] `loadRuns` skips corrupted lines without failing
- [ ] `appendRun` creates `runs.jsonl` if it doesn't exist
- [ ] `appendRun` appends valid JSON line with trailing newline
- [ ] Multiple `appendRun` calls produce valid multi-line JSONL
- [ ] `writeStdout` creates the file with correct content
- [ ] `writeStderr` creates the file with correct content
- [ ] Empty content → empty file, not missing file
- [ ] `deleteRuns` removes matching entries from `runs.jsonl`
- [ ] `deleteRuns` removes corresponding `.stdout` and `.stderr` files
- [ ] `deleteRuns` leaves non-matching entries intact
- [ ] `deleteRuns` handles missing output files without error
