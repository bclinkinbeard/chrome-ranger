# Spec 09: Iteration Runner

## Purpose

Execute a single iteration of the user's command with the full environment contract. Capture stdout, stderr, duration, and exit code. This is the lowest-level execution unit — it runs one command and returns the result.

## Public Interface

```typescript
interface IterationInput {
  id: string;          // pre-generated UUID for this run
  command: string;     // shell command to execute
  chromeBin: string;   // absolute path to Chrome binary
  chromeVersion: string;
  ref: string;
  sha: string;
  codeDir: string;     // absolute path to worktree
  iteration: number;
}

interface IterationResult {
  id: string;
  chrome: string;
  ref: string;
  sha: string;
  iteration: number;
  timestamp: string;   // ISO 8601 UTC, captured at start
  durationMs: number;  // wall clock
  exitCode: number;
  stdout: string;      // full captured stdout
  stderr: string;      // full captured stderr
}

/**
 * Execute a single iteration. Spawns the command via shell with
 * the environment contract, captures all output, and returns the result.
 * Never throws — failures are encoded in the result's exitCode.
 */
function runIteration(input: IterationInput): Promise<IterationResult>;
```

## Behavior

### `runIteration`

1. Record `timestamp` as current time in ISO 8601 UTC
2. Record start time for duration measurement
3. Spawn the command via shell (`child_process.spawn` with `shell: true`):
   - `cwd`: `input.codeDir`
   - `env`: inherit current env, then overlay:
     - `CHROME_BIN` = `input.chromeBin`
     - `CHROME_VERSION` = `input.chromeVersion`
     - `CODE_REF` = `input.ref`
     - `CODE_SHA` = `input.sha`
     - `CODE_DIR` = `input.codeDir`
     - `ITERATION` = `String(input.iteration)`
   - `stdio`: pipe stdout and stderr for capture
4. Collect stdout and stderr into buffers
5. Wait for the process to exit
6. Compute `durationMs` = end time - start time
7. Return `IterationResult` with all fields populated
8. If the process is killed by a signal (no exit code), use exit code `1`

## Environment Contract

The spawned command receives all env vars from the parent process plus the six contract variables. This means `PATH`, `HOME`, `USER`, etc. are inherited so the user's script can find tools like `npx`, `node`, etc.

The contract variables always override any existing env vars of the same name.

## Edge Cases

- Command exits with code 0 → `exitCode: 0`
- Command exits with non-zero code → that code in `exitCode`
- Command is killed by signal → `exitCode: 1` (or signal number + 128 if available)
- Command produces no stdout → `stdout: ""`
- Command produces no stderr → `stderr: ""`
- Command produces large output (>1MB) → fully captured (no truncation)
- Command writes binary/null bytes to stdout → captured as-is
- `ITERATION` is stringified (e.g., `"0"`, `"42"`)
- Command doesn't exist → shell reports error to stderr, exits non-zero
- `codeDir` doesn't exist → shell reports error, exits non-zero

## Acceptance Criteria

- [ ] Command runs with `cwd` set to `codeDir`
- [ ] All 6 env vars are set correctly in the child process
- [ ] Env vars override any existing vars of the same name
- [ ] Parent env vars (PATH, HOME, etc.) are inherited
- [ ] `ITERATION` is a string
- [ ] stdout captured verbatim
- [ ] stderr captured verbatim
- [ ] Exit code is captured correctly for success (0)
- [ ] Exit code is captured correctly for failure (non-zero)
- [ ] `durationMs` is positive and reasonable
- [ ] `timestamp` is valid ISO 8601 UTC
- [ ] Empty stdout/stderr → empty strings, not null/undefined
- [ ] Function never throws — all failures encoded in result
- [ ] `id` from input is passed through to result

## Test Strategy

Use simple shell commands as the "command":
- `echo hello` — test stdout capture
- `echo err >&2` — test stderr capture
- `exit 1` — test failure capture
- `printenv CHROME_BIN` — test env vars
- `pwd` — test cwd

No Chrome binary or git repo needed.
