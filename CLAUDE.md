# CLAUDE.md

## What is this project?

chrome-ranger is a CLI orchestrator that runs arbitrary scripts against a matrix of Chrome versions × git refs. It manages Chrome binary downloads, git worktrees, parallel execution, and raw output capture. It does NOT parse output, compute statistics, or generate reports — analysis is the user's responsibility.

## Project status

Design phase. No implementation code exists yet. The design is documented in DESIGN.md and a user-facing README.md is in place.

## Key documents

- `DESIGN.md` — full technical design: config format, data model, CLI commands, run behavior, parallelism, storage layout, environment contract, and a complete example walkthrough
- `README.md` — user-facing documentation with quick start, config reference, example, and failure/resume behavior

## Tech stack

- TypeScript / Node.js
- **commander** — CLI parsing
- **js-yaml** — config parsing
- **tsup** — build/bundle

## Architecture decisions

- Config file is `chrome-ranger.yaml` at project root
- User's script receives env vars (`CHROME_BIN`, `CHROME_VERSION`, `CODE_REF`, `CODE_SHA`, `CODE_DIR`, `ITERATION`) — the CLI has no opinion on what the script does with them
- stdout/stderr captured verbatim per run to `.chrome-ranger/output/{id}.stdout` and `.stderr`
- Run metadata is append-only JSONL at `.chrome-ranger/runs.jsonl`
- Chrome binaries cached at `~/.cache/chrome-ranger/` (respects `XDG_CACHE_HOME`), shared across projects
- Git worktrees managed in `.chrome-ranger/worktrees/`
- `setup` command runs once per worktree before first iteration
- `run` is resumable — re-running only fills in failed/missing iterations for unchanged refs
- Failures don't abort the run; failed iterations get the same metadata shape with non-zero `exitCode`
- Parallelism via `workers` config; `runs.jsonl` writes are serialized

## CLI commands

- `chrome-ranger init` — scaffold config
- `chrome-ranger run` — execute matrix (supports `--chrome`, `--refs`, `--append N`, `--replace`)
- `chrome-ranger status` — matrix completion table
- `chrome-ranger list-chrome` — query Chrome for Testing API
- `chrome-ranger cache clean` — remove cached binaries
