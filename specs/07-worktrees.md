# Spec 07: Worktree Management

## Purpose

Create, reuse, and clean git worktrees for each ref in the matrix. Worktrees isolate each ref's code so multiple refs can run concurrently without interfering with the user's working directory.

## Public Interface

```typescript
interface Worktree {
  ref: string;
  sha: string;
  path: string;   // absolute path to worktree directory
}

/**
 * Resolve a git ref to its commit SHA.
 * Throws if the ref doesn't exist.
 */
function resolveRef(repoDir: string, ref: string): Promise<string>;

/**
 * Create or reuse a git worktree for the given ref.
 * Worktrees are placed at {projectDir}/.chrome-ranger/worktrees/{safeName}
 * Returns the worktree info.
 */
function ensureWorktree(projectDir: string, ref: string, sha: string): Promise<Worktree>;

/**
 * Convert a ref name to a safe directory name.
 * Replaces slashes with hyphens. Disambiguates on collision.
 */
function safeWorktreeName(ref: string, existingNames: string[]): string;

/**
 * Remove all worktrees in .chrome-ranger/worktrees/ and prune from git.
 */
function cleanWorktrees(projectDir: string): Promise<void>;
```

## Behavior

### `resolveRef`

1. Run `git rev-parse {ref}` in the repo directory
2. Return the full SHA (40 chars)
3. If the ref doesn't exist, throw: `Git ref not found: {ref}`

### `ensureWorktree`

1. Compute directory name via `safeWorktreeName`
2. Target path: `{projectDir}/.chrome-ranger/worktrees/{safeName}`
3. If the directory already exists and is a valid git worktree:
   - Check out the target SHA: `git -C {path} checkout --detach {sha}`
   - Return existing worktree
4. If the directory doesn't exist:
   - Create worktree: `git worktree add --detach {path} {sha}`
   - Return new worktree
5. All worktrees are created detached (not on a branch) to avoid issues with branch state

### `safeWorktreeName`

1. Replace `/` with `-` in the ref name
2. If the resulting name collides with an entry in `existingNames` that maps to a different ref, append a numeric suffix: `{name}-2`, `{name}-3`, etc.
3. Examples:
   - `main` → `main`
   - `feature/virtual-list` → `feature-virtual-list`
   - `v4.5.0` → `v4.5.0`

### `cleanWorktrees`

1. List all directories under `{projectDir}/.chrome-ranger/worktrees/`
2. For each, run `git worktree remove {path} --force`
3. Run `git worktree prune` to clean up stale references
4. Remove the `worktrees/` directory itself
5. No error if `worktrees/` directory doesn't exist

## Edge Cases

- Ref is a branch name that currently matches HEAD → still gets a worktree (design decision: always create worktree, never use working directory)
- Ref is a tag → `resolveRef` still works via `git rev-parse`
- Ref is a full SHA → works directly
- Ref is a short SHA → resolves via `git rev-parse`
- Ref name `feature/foo` and `feature-foo` both exist → `safeWorktreeName` disambiguates with suffix
- Worktree directory exists but is not a valid git worktree (e.g., leftover directory) → remove and recreate
- `cleanWorktrees` when no worktrees exist → no error

## Acceptance Criteria

- [ ] `resolveRef` returns full 40-char SHA for a valid branch
- [ ] `resolveRef` returns full SHA for a valid tag
- [ ] `resolveRef` throws for a non-existent ref
- [ ] `ensureWorktree` creates a new worktree at the correct path
- [ ] `ensureWorktree` reuses an existing worktree (updates to correct SHA)
- [ ] Worktree is detached at the correct commit
- [ ] `safeWorktreeName` replaces slashes with hyphens
- [ ] `safeWorktreeName` disambiguates collisions with numeric suffix
- [ ] `cleanWorktrees` removes all worktree directories
- [ ] `cleanWorktrees` runs `git worktree prune`
- [ ] `cleanWorktrees` is idempotent (no error if no worktrees exist)

## Test Strategy

Tests need a real git repo (can be created in a temp directory during test setup). Create a repo with a few commits on different branches/tags. No network access needed.
