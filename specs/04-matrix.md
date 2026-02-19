# Spec 04: Matrix Computation

## Purpose

Generate the full matrix of `(chrome version, ref, iteration)` cells from config, and diff it against existing runs to determine what's pending. This is pure computation — no I/O beyond what's passed in.

## Public Interface

### Types

```typescript
interface MatrixCell {
  chrome: string;     // full version string
  ref: string;        // ref name from config
  sha: string;        // resolved commit SHA
  iteration: number;  // 0-indexed
}

interface ResolvedRef {
  ref: string;
  sha: string;
}
```

### Functions

```typescript
/**
 * Generate the full matrix from config and resolved refs.
 * Returns one MatrixCell per (chrome, ref, iteration).
 */
function generateMatrix(
  chromeVersions: string[],
  resolvedRefs: ResolvedRef[],
  iterations: number
): MatrixCell[];

/**
 * Compute which cells are still pending by diffing the full matrix
 * against completed runs. A cell is complete when it has at least one
 * run with exitCode === 0 for that (chrome, sha, iteration).
 */
function computePending(
  matrix: MatrixCell[],
  completedRuns: RunMeta[]
): MatrixCell[];

/**
 * Filter matrix cells by --chrome and --refs flags.
 * If a filter is undefined/empty, it doesn't restrict.
 */
function filterMatrix(
  matrix: MatrixCell[],
  chromeFilter?: string[],
  refsFilter?: string[]
): MatrixCell[];

/**
 * Compute append cells: N additional iterations per targeted cell,
 * continuing iteration numbering from the highest existing iteration.
 */
function computeAppend(
  chromeVersions: string[],
  resolvedRefs: ResolvedRef[],
  existingRuns: RunMeta[],
  appendCount: number,
  chromeFilter?: string[],
  refsFilter?: string[]
): MatrixCell[];
```

## Behavior

### `generateMatrix`

Cartesian product: for each chrome version × each resolved ref × each iteration index `[0, iterations)`, produce a `MatrixCell`. Order: iterate chrome versions outer, refs middle, iterations inner.

Example: 2 chrome versions × 2 refs × 3 iterations = 12 cells.

### `computePending`

For each cell in the matrix, check if `completedRuns` contains a `RunMeta` where:
- `run.chrome === cell.chrome`
- `run.sha === cell.sha` (NOT `run.ref` — SHA is the identity)
- `run.iteration === cell.iteration`
- `run.exitCode === 0`

If such a run exists, the cell is complete. Otherwise it's pending.

Key: matching is by SHA, not ref name. If a branch advances to a new commit, old runs for the previous SHA don't satisfy the new SHA's cells.

### `filterMatrix`

- If `chromeFilter` is provided and non-empty, keep only cells where `cell.chrome` is in the filter
- If `refsFilter` is provided and non-empty, keep only cells where `cell.ref` is in the filter
- Filters are ANDed: both must match if both are provided

### `computeAppend`

1. Group existing runs by `(chrome, sha)` cell
2. For each targeted cell, find the max iteration index among existing runs
3. Generate `appendCount` new cells starting from `maxIteration + 1`
4. Apply chrome/refs filters

## Edge Cases

- Empty `completedRuns` → all cells are pending
- A cell with only failed runs (exitCode !== 0) → still pending
- A cell with both failed and successful runs → complete (the success counts)
- Runs for a chrome version not in config → ignored (don't affect pending)
- Runs for a ref whose SHA has changed → don't count (SHA mismatch)
- `chromeFilter` with a version not in config → no cells match (empty result for that version)
- `refsFilter` with a ref not in config → no cells match (empty result for that ref)
- `computeAppend` with no existing runs → append starts at iteration 0

## Acceptance Criteria

- [ ] `generateMatrix` produces correct cartesian product
- [ ] 2 chrome × 2 refs × 3 iterations = 12 cells
- [ ] 1 chrome × 1 ref × 1 iteration = 1 cell
- [ ] `computePending` returns all cells when no runs exist
- [ ] `computePending` returns empty when all cells have exitCode:0 runs
- [ ] `computePending` keeps cells where only failed runs exist
- [ ] `computePending` removes cells where at least one exitCode:0 run exists
- [ ] `computePending` matches by SHA, not ref name
- [ ] `computePending` ignores runs for SHA values not in the matrix
- [ ] `filterMatrix` with chrome filter keeps only matching chrome versions
- [ ] `filterMatrix` with refs filter keeps only matching refs
- [ ] `filterMatrix` with both filters applies AND logic
- [ ] `filterMatrix` with no filters returns all cells
- [ ] `computeAppend` continues iteration numbering from max existing
- [ ] `computeAppend` with no existing runs starts at iteration 0
- [ ] `computeAppend` respects chrome/refs filters
