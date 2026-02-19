# Spec 14: CLI Commands

## Purpose

Define the `commander` program with all subcommands, parse arguments, and wire them to the appropriate modules. This is the entry point (`src/cli.ts`). All CLI output goes to stderr.

## Public Interface

The CLI is the public interface — it's what users interact with. No programmatic API is exported from this module.

## Commands

### `chrome-ranger init [--force]`

**Purpose:** Scaffold a `chrome-ranger.yaml` in the current directory.

**Behavior:**
1. Check if `chrome-ranger.yaml` exists in cwd
2. If exists and `--force` not set → error: `chrome-ranger.yaml already exists. Use --force to overwrite.`
3. If exists and `--force` set → overwrite
4. If not exists → create
5. Write scaffold content:

```yaml
command: npx playwright test
setup: npm ci
iterations: 5
warmup: 1
workers: 2

chrome:
  versions:
    - "REPLACE_WITH_VERSION"

code:
  repo: .
  refs:
    - main
```

6. Emit to stderr: `Created chrome-ranger.yaml`

**Acceptance Criteria:**
- [ ] Creates `chrome-ranger.yaml` in cwd
- [ ] Refuses if file exists (without `--force`)
- [ ] Overwrites with `--force`
- [ ] Scaffold content is valid YAML

---

### `chrome-ranger run [options]`

**Options:**
- `--chrome <version>` (repeatable) — filter to specific Chrome versions
- `--refs <ref>` (repeatable) — filter to specific refs
- `--append <N>` — add N iterations beyond configured minimum
- `--replace` — clear targeted cells and re-run

**Behavior:** Delegates to `executeRun()` from the orchestrator (spec 12).

**Argument parsing:**
- `--chrome` and `--refs` are repeatable: `--chrome 120.0.6099.109 --chrome 122.0.6261.94`
- `--append` takes a positive integer
- `--replace` is a boolean flag
- `--append` and `--replace` are mutually exclusive → error if both provided

**Acceptance Criteria:**
- [ ] `--chrome` accepts multiple values
- [ ] `--refs` accepts multiple values
- [ ] `--append` requires a positive integer
- [ ] `--replace` is a boolean flag
- [ ] `--append` + `--replace` together → error
- [ ] No flags → default run (fill to minimum)
- [ ] Exit code 0 on success, non-zero on failure

---

### `chrome-ranger status`

**Behavior:**
1. Load config
2. Resolve all refs to SHAs
3. Load `runs.jsonl`
4. Build completion matrix
5. Print the matrix table to stderr

**Output format:**

```
               main (e7f8a9b)   v4.5.0 (c3d4e5f)
Chrome 120    5/5 ✓             5/5 ✓
Chrome 121    8/5 ✓             3/5 ...
Chrome 122    0/5               0/5
```

Rules:
- Rows: Chrome versions (prefixed with `Chrome`, using full version or major)
- Columns: refs with short SHA
- Cell values: `{successful}/{target}`
- Cell with `successful >= target` → append ` ✓`
- Cell with `0 < successful < target` and some failures → append ` ✗ ({N} failed)`
- Cell with `0 < successful < target` and no failures → append ` ...`
- Cell with `0` successful → no suffix

**Acceptance Criteria:**
- [ ] Shows all chrome versions × refs grid
- [ ] Shows correct completion counts
- [ ] `✓` for complete cells
- [ ] `✗` for cells with failures
- [ ] `...` for incomplete cells without failures
- [ ] `0/N` for cells with no runs
- [ ] Empty `runs.jsonl` → all cells show `0/N`
- [ ] No `runs.jsonl` file → all cells show `0/N`

---

### `chrome-ranger list-chrome [--latest N] [--since DATE]`

**Behavior:**
1. Call `listChromeVersions()`
2. Apply filters:
   - `--latest N` → show only the N most recent versions
   - `--since DATE` → show only versions released on or after DATE
3. Print version list to stderr

**Output format:**

```
120.0.6099.109
121.0.6167.85
122.0.6261.94
```

One version per line, newest first.

**Acceptance Criteria:**
- [ ] Lists available Chrome versions (stable channel only)
- [ ] `--latest N` limits output count
- [ ] `--since DATE` filters by date
- [ ] Output is one version per line

---

### `chrome-ranger cache clean`

**Behavior:**
1. Resolve cache directory (config → XDG → default)
2. Call `cleanCache(cacheDir)`
3. Emit: `Removed cached Chrome binaries from {cacheDir}`

**Acceptance Criteria:**
- [ ] Removes the cache directory
- [ ] Reports what was removed
- [ ] No error if cache doesn't exist

---

### `chrome-ranger clean`

**Behavior:**
1. Call `cleanWorktrees(projectDir)`
2. Emit: `Removed worktrees from .chrome-ranger/worktrees/`

**Acceptance Criteria:**
- [ ] Removes all worktrees
- [ ] Prunes git worktree references
- [ ] No error if no worktrees exist

---

## Global Behavior

### Output destination

All CLI output goes to stderr. stdout is never written to. This keeps stdout clean for piping/scripting.

### Error format

Errors are prefixed with `error: `:

```
error: Config file not found: chrome-ranger.yaml. Run "chrome-ranger init" to create one.
error: Another chrome-ranger process (PID 12345) is running against this project.
error: Git ref not found: feature/nonexistent
```

No stack traces unless `DEBUG=chrome-ranger` is set. When debug mode is on, append the full stack trace after the error message.

### Exit codes

| Scenario | Exit code |
|---|---|
| Success | 0 |
| Config error | 1 |
| Lock contention | 1 |
| Some iterations failed | 0 (failures are normal, logged in runs.jsonl) |
| All iterations failed | 0 (same — data was collected) |
| SIGINT | 130 |
| SIGTERM | 143 |
| Unhandled error | 1 |
