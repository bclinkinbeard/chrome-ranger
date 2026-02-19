# Spec 01: Project Setup

## Purpose

Scaffold the TypeScript/Node.js project with build tooling, test framework, and dependency configuration. This is the foundation everything else builds on.

## Deliverables

### `package.json`

```json
{
  "name": "chrome-ranger",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "chrome-ranger": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### Dependencies

Production:
- `commander` — CLI parsing
- `js-yaml` — config parsing
- `@puppeteer/browsers` — Chrome binary download/cache

Dev:
- `typescript`
- `tsup` — build/bundle
- `vitest` — test framework
- `@types/node`
- `@types/js-yaml`

### `tsconfig.json`

- `target`: `ES2022`
- `module`: `Node16` / `NodeNext`
- `moduleResolution`: `Node16` / `NodeNext`
- `strict`: `true`
- `outDir`: `./dist`
- `rootDir`: `./src`
- `declaration`: `true`

### `tsup.config.ts`

- Entry: `src/cli.ts`
- Format: `esm`
- Target: `node20`
- Clean: `true`
- Add shebang `#!/usr/bin/env node` to output

### Vitest config

- No special config needed beyond defaults — vitest auto-discovers `*.test.ts` files

### Source structure

```
src/
  cli.ts          # entry point — commander program definition
  config.ts       # config parsing and validation
  matrix.ts       # matrix computation and diffing
  runs.ts         # runs.jsonl and output file I/O
  lockfile.ts     # lockfile acquisition and release
  chrome.ts       # Chrome binary management
  worktrees.ts    # git worktree management
  setup.ts        # setup command execution
  runner.ts       # single iteration execution
  pool.ts         # worker pool for parallel execution
  warmup.ts       # warmup iteration handling
  orchestrator.ts # run pipeline coordinator
  signals.ts      # signal handling (SIGINT/SIGTERM)
  types.ts        # shared type definitions
```

### `.gitignore` additions

```
node_modules/
dist/
.chrome-ranger/
```

## Acceptance Criteria

- [ ] `npm install` succeeds
- [ ] `npm run build` produces `dist/cli.js` with a shebang line
- [ ] `npm test` runs vitest (can pass with zero tests)
- [ ] `npm run lint` runs `tsc --noEmit` successfully
- [ ] `src/cli.ts` exports a commander program that prints help text
- [ ] `npx chrome-ranger --help` works after build (shows usage)
