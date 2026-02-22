# Benchmark Project Candidates

Open source projects with benchmarking scripts that can exercise chrome-ranger. Organized by how well they fit the Chrome versions × git refs matrix.

## Tier 1 — Browser-native benchmarks (both dimensions matter)

These run benchmarks inside Chrome, so `CHROME_BIN` directly affects results.

### 1. krausest/js-framework-benchmark

- **URL:** https://github.com/krausest/js-framework-benchmark
- **Stars:** ~7,400
- **Bench tool:** Puppeteer + Chrome DevTools Protocol
- **What:** Compares DOM rendering performance across 186+ JS framework implementations by measuring create/update/delete operations on large tables via Chrome timeline entries.
- **Why it fits:** Already tracks results per Chrome version with git tags (`chrome100`, `chrome131`, `chrome144`). Accepts `--chromeBinary` which maps directly to `CHROME_BIN`. Maintainer documents perf differences between Chrome releases.
- **Run:** `npm run bench -- --framework keyed/vanillajs --chromeBinary $CHROME_BIN`

### 2. lit/lit

- **URL:** https://github.com/lit/lit
- **Stars:** ~21,200
- **Bench tool:** Google Tachometer (statistically rigorous, runs in Chrome)
- **What:** Google's web components library. Has `packages/benchmarks/` with Tachometer configs measuring template rendering in a real Chrome instance.
- **Why it fits:** Tachometer auto-samples until statistical significance. 560+ release tags (`lit@2.0.0` → `lit@3.3.1`). No published cross-version benchmark comparisons exist — chrome-ranger could fill this gap.
- **Run:** `npx tachometer --config packages/benchmarks/tachometer.json --browser chrome`

### 3. GoogleChromeLabs/css-selector-benchmark

- **URL:** https://github.com/GoogleChromeLabs/css-selector-benchmark
- **Stars:** ~23
- **Bench tool:** Puppeteer + Chrome PerfTestRunner
- **What:** Benchmarks CSS selector matching and style recalculation — tied to Chrome's rendering engine internals.
- **Why it fits:** Built by Chrome Labs to measure Chrome rendering perf. Puppeteer with configurable browser binary. CSS selector perf varies across Chrome releases.
- **Run:** `npm run benchmark example`

### 4. styled-components/styled-components

- **URL:** https://github.com/styled-components/styled-components
- **Stars:** ~41,000
- **Bench tool:** Puppeteer (headless Chrome)
- **What:** CSS-in-JS library. Benchmarks measure mount-deep-tree, mount-wide-tree, and update-dynamic-styles via Chrome CSSOM APIs.
- **Why it fits:** CSSOM performance varies across Chrome versions. Major architectural changes between v3→v6. A perf-focused fork claimed 40% faster renders.
- **Run:** `yarn run benchmarks`

## Tier 2 — vitest bench projects (validates general-purpose nature)

These run in Node.js, exercising V8 engine performance. The git ref dimension is the primary value here.

### 5. toss/es-toolkit

- **URL:** https://github.com/toss/es-toolkit
- **Stars:** ~10,800
- **Bench tool:** vitest bench (tinybench under the hood)
- **What:** Modern lodash alternative with **282 `.bench.ts` files** comparing es-toolkit vs lodash for array, object, string, function, and math operations.
- **Why it fits:** Largest vitest bench suite in the wild. Pure JS computation exercises V8's JIT optimizer directly. Note: running all 282 files at once can hit vitest memory limits — use glob patterns for subsets.
- **Run:** `yarn bench` (runs `vitest bench`)

### 6. oxc-project/bench-transformer

- **URL:** https://github.com/oxc-project/bench-transformer
- **Stars:** ~22
- **Bench tool:** vitest bench
- **What:** Compares code transformation performance: OXC (Rust/NAPI) vs SWC vs Babel on real-world files (TypeScript `parser.ts` at 10,777 lines, Vue `renderer.ts` at 2,550 lines).
- **Why it fits:** Babel benchmarks are pure JS showing V8 variation. Compact (2 bench files), fast to run.
- **Run:** `pnpm bench` (runs `vitest bench --run`)

## Tier 3 — Alternative benchmark tools

### 7. fastify/fast-json-stringify

- **URL:** https://github.com/fastify/fast-json-stringify
- **Stars:** ~3,700
- **Bench tool:** tinybench v6 in isolated worker threads
- **What:** JSON serializer 2x faster than `JSON.stringify()`. Compares against native stringify, AJV Serialize, and others. Has a **built-in branch comparison script** (`bench-cmp-branch.js`).
- **Why it fits:** The branch comparison feature is directly analogous to chrome-ranger's git ref dimension.
- **Run:** `npm run bench` / `npm run bench:cmp`

### 8. pinojs/pino

- **URL:** https://github.com/pinojs/pino
- **Stars:** ~17,400
- **Bench tool:** fastbench (custom micro-library) + child process isolation
- **What:** Fastest Node.js JSON logger. ~10 benchmark files comparing Pino vs Bunyan, Winston, Bole, Debug, and LogLevel.
- **Why it fits:** Demonstrates chrome-ranger works with non-standard benchmark tooling. Many release tags for version comparison.
- **Run:** `npm run bench-basic`

## Recommendations

Start with **js-framework-benchmark** (#1) and **es-toolkit** (#5):

- **js-framework-benchmark** exercises both dimensions of chrome-ranger's matrix perfectly (it was practically built for this use case)
- **es-toolkit** is the best vitest bench example in the wild, proving chrome-ranger's general-purpose nature

Together they validate the tool's core value proposition: running the same benchmark script across Chrome versions × git refs.
