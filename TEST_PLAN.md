# Test Plan

## Testing Strategy

Unit tests for pure logic (config parsing, matrix computation, run diffing). Integration tests for CLI commands using a real git repo and mock/stub Chrome binaries. No real Chrome downloads in CI — stub `@puppeteer/browsers` where needed.

Test framework: **vitest** (aligns with TypeScript/Node stack).

---

## 1. Config Parsing

### 1.1 Valid config
- Parses a complete `chrome-ranger.yaml` with all fields
- Default values applied: `workers: 1` when omitted, `warmup: 0` when omitted
- `setup` is optional — config without `setup` is valid

### 1.2 Invalid config
- Missing required fields (`command`, `chrome.versions`, `code.refs`) → clear error
- Empty `chrome.versions` array → error
- Empty `code.refs` array → error
- `iterations` ≤ 0 → error
- `workers` ≤ 0 → error
- `warmup` < 0 → error
- Non-existent config file → clear error message (no stack trace)
- Malformed YAML → clear error message

### 1.3 Config edge cases
- Chrome version strings with various formats (3-part, 4-part)
- Ref names with slashes (`feature/virtual-list`), dots (`v4.5.0`), hyphens

---

## 2. Matrix Computation

### 2.1 Full matrix generation
- 2 Chrome versions × 2 refs × 3 iterations = 12 cells
- 1 Chrome version × 1 ref × 1 iteration = 1 cell
- Large matrix: 5 × 5 × 10 = 250 cells

### 2.2 Diff against completed runs
- Empty `runs.jsonl` → all cells pending
- All cells have `exitCode: 0` runs → nothing pending
- Cell with `exitCode: 1` run → still pending (only `exitCode: 0` counts)
- Cell with both a failed and a successful run → complete (success counts)
- Mix of complete and incomplete cells → only incomplete are pending

### 2.3 SHA-based matching
- Ref resolves to same SHA as recorded → runs count toward completion
- Ref resolves to different SHA than recorded → old runs don't count, cell is pending

---

## 3. `chrome-ranger init`

- Creates `chrome-ranger.yaml` in current directory with scaffold content
- Refuses to overwrite existing `chrome-ranger.yaml`

---

## 4. `chrome-ranger run`

### 4.1 Happy path
- Single Chrome version, single ref, `iterations: 1` → 1 run in `runs.jsonl`, output files exist
- Verify all env vars are set correctly: `CHROME_BIN`, `CHROME_VERSION`, `CODE_REF`, `CODE_SHA`, `CODE_DIR`, `ITERATION`
- Verify `durationMs` is reasonable (> 0, < timeout)
- Verify `timestamp` is valid ISO 8601
- Verify `id` is a valid UUID
- Verify stdout/stderr captured verbatim in output files

### 4.2 Multiple iterations
- `iterations: 3` → 3 entries in `runs.jsonl` for each cell
- `ITERATION` values are 0, 1, 2

### 4.3 Matrix execution
- 2 Chrome versions × 2 refs × 2 iterations → 8 entries in `runs.jsonl`
- Each entry has the correct (chrome, ref, sha) combination

### 4.4 Worktree management
- Worktree created for each ref under `.chrome-ranger/worktrees/`
- Worktree is at the correct commit SHA
- Ref with slashes produces a valid directory name
- Reuses existing worktree on second run (no error)

### 4.5 Setup command
- `setup` runs once per worktree, not per iteration
- `setup` runs before any iterations for that ref
- Skips setup if already set up for the same SHA
- Setup failure for one ref → that ref skipped, other refs continue
- Setup failure → no iterations recorded for that ref

### 4.6 Warmup
- `warmup: 2` → 2 warmup iterations per (chrome, ref) cell before real iterations
- Warmup iterations NOT written to `runs.jsonl`
- Warmup iterations NOT written to output directory
- Warmup failure → all iterations for that cell skipped
- Warmup failure for one cell → other cells still run
- `warmup: 0` → no warmup, iterations start immediately

### 4.7 Failure handling
- Command exits non-zero → run recorded with `exitCode` in `runs.jsonl`
- Stdout/stderr still captured for failed runs
- Failed run does not abort other pending runs
- Failed cell remains pending on next `chrome-ranger run`

### 4.8 Resumability
- First run: 2 of 4 cells succeed, 2 fail → second run only attempts the 2 failed cells
- First run: all succeed → second run does nothing ("Skipping N completed iterations")
- First run interrupted → second run picks up remaining cells

### 4.9 Workers / parallelism
- `workers: 1` → iterations run serially
- `workers: 2` → at most 2 concurrent processes
- `runs.jsonl` entries are valid JSON (no interleaving) under concurrent writes

### 4.10 `--chrome` filter
- `--chrome 120.0.6099.109` → only runs cells for that Chrome version
- Other Chrome versions untouched

### 4.11 `--refs` filter
- `--refs main` → only runs cells for that ref
- Other refs untouched

### 4.12 `--append N`
- Adds N additional runs to each targeted cell beyond the configured `iterations`
- Does not re-run existing iterations

### 4.13 `--replace`
- Deletes existing runs for targeted cells from `runs.jsonl`
- Deletes corresponding output files
- Then runs fresh iterations for those cells
- Untargeted cells are untouched in `runs.jsonl`

### 4.14 `--replace` with filters
- `--replace --chrome 120.0.6099.109` → only clears and re-runs cells for Chrome 120
- Other Chrome version cells remain in `runs.jsonl`

---

## 5. Lockfile

### 5.1 Basic locking
- `chrome-ranger run` creates `.chrome-ranger/lock`
- Second concurrent `chrome-ranger run` fails immediately with clear error
- Lock released after successful run
- Lock released after failed run

### 5.2 Signal handling
- SIGINT during run → lock released
- SIGTERM during run → lock released

### 5.3 Atomic acquisition
- Lock uses atomic file creation (O_EXCL or equivalent) — not check-then-create

---

## 6. `chrome-ranger status`

### 6.1 Display
- Shows matrix with Chrome versions as rows, refs as columns
- Shows `N/M ✓` for complete cells
- Shows `N/M ✗ (K failed)` for cells with failures
- Shows `0/M` for cells with no runs

### 6.2 Edge cases
- Empty `runs.jsonl` → all cells show `0/N`
- No `runs.jsonl` file → all cells show `0/N`
- Runs from a Chrome version no longer in config → not displayed (or handled gracefully)

---

## 7. Chrome Binary Management

### 7.1 Download and cache
- Downloads Chrome binary via `@puppeteer/browsers` when not cached
- Reuses cached binary on subsequent runs
- Respects `XDG_CACHE_HOME` for cache location
- Respects `chrome.cache_dir` config override

### 7.2 `chrome-ranger list-chrome`
- Returns available Chrome versions
- `--latest N` limits results
- `--since DATE` filters by date

### 7.3 `chrome-ranger cache clean`
- Removes cached Chrome binaries
- After clean, next run re-downloads

---

## 8. Signal Handling

### 8.1 SIGINT during iterations
- In-flight iterations killed
- No partial results written to `runs.jsonl`
- Already-completed iterations remain in `runs.jsonl`
- Lockfile released
- Exit code is non-zero

### 8.2 SIGINT during setup
- Setup process killed
- No iterations dispatched for that ref
- Lockfile released

### 8.3 SIGINT during warmup
- Warmup process killed
- No iterations dispatched for that cell
- Lockfile released

---

## 9. Output Integrity

### 9.1 Consistency
- Every entry in `runs.jsonl` has corresponding `{id}.stdout` and `{id}.stderr` files
- Every output file pair has a corresponding `runs.jsonl` entry
- No orphaned output files after a clean run

### 9.2 Content fidelity
- Binary-safe: stdout with null bytes is captured correctly
- Large output (> 1MB) captured completely
- Empty stdout/stderr → empty files (not missing files)
- Multi-line output preserved exactly

---

## 10. `runs.jsonl` Format

### 10.1 Schema
- Each line is valid JSON
- Each line has all required `RunMeta` fields: `id`, `chrome`, `ref`, `sha`, `iteration`, `timestamp`, `durationMs`, `exitCode`
- `id` is a valid UUID v4
- `timestamp` is valid ISO 8601
- `durationMs` is a non-negative number
- `exitCode` is an integer

### 10.2 Append-only behavior
- New runs append to end of file
- Existing lines are not modified (except by `--replace`)

---

## 11. Error Messages

- Missing config file → helpful message mentioning `chrome-ranger init`
- Invalid config → identifies which field is wrong
- Lock already held → message says another process is running
- Unknown Chrome version (download fails) → identifies the version
- Git ref not found → identifies the ref
- Setup command failed → shows exit code and stderr
- Warmup failed → identifies the (chrome, ref) cell

---

## Test Infrastructure

### Fixtures
- A small git repo with 2-3 commits on different branches/tags
- A trivial `command` script (e.g., `echo '{"ok":true}'`) for fast iteration
- A `command` script that exits non-zero for failure tests
- A stub/mock for `@puppeteer/browsers` that returns a path to a no-op binary

### What NOT to test
- Actual Chrome downloads (network dependency, slow)
- Actual Playwright execution (not our code)
- Specific Chrome binary behavior (not our code)
