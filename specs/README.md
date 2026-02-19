# Spec-Driven Development Plan

This directory contains implementation specs for chrome-ranger. Each spec is a self-contained unit describing one module's purpose, public interface, behavior, edge cases, and acceptance criteria. Specs are ordered by dependency — implement them in sequence.

## Implementation Order

```
01-project-setup          No dependencies — scaffolds the project
02-config                 No dependencies — pure parsing/validation
03-runs-store             No dependencies — file I/O for runs.jsonl and output
04-matrix                 Depends on: 02-config, 03-runs-store
05-lockfile               No dependencies — standalone file locking
06-chrome                 No dependencies — wraps @puppeteer/browsers
07-worktrees              No dependencies — wraps git worktree commands
08-setup-runner           Depends on: 07-worktrees
09-iteration-runner       Depends on: 03-runs-store
10-worker-pool            Depends on: 09-iteration-runner
11-warmup                 Depends on: 09-iteration-runner
12-run-orchestrator       Depends on: 02, 03, 04, 05, 06, 07, 08, 10, 11
13-signal-handling        Depends on: 05-lockfile, 10-worker-pool
14-cli                    Depends on: all above
```

## Dependency Graph

```
01-project-setup
  └─ (everything depends on this implicitly)

02-config ─────────────┐
03-runs-store ─────────┤
                       ├─► 04-matrix
05-lockfile            │
06-chrome              │
07-worktrees ──► 08-setup-runner
                       │
03-runs-store ──► 09-iteration-runner ──┬─► 10-worker-pool
                                        └─► 11-warmup
                                              │
02 + 03 + 04 + 05 + 06 + 07 + 08 + 10 + 11 ──► 12-run-orchestrator
                                                        │
05 + 10 ──► 13-signal-handling                          │
                                                        │
                                            all ──► 14-cli
```

## How to Use These Specs

Each spec follows this structure:

- **Purpose** — what this module does and why it exists
- **Public Interface** — exported functions/types with signatures
- **Behavior** — step-by-step description of what the code does
- **Edge Cases** — non-obvious scenarios that must be handled
- **Acceptance Criteria** — concrete, testable statements (write tests for these)
- **Test Fixtures** — what test infrastructure is needed (if any)

Workflow for each spec:
1. Read the spec
2. Write the tests (they should all fail)
3. Implement the module until all tests pass
4. Move to the next spec
