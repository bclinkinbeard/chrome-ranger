# Benchmark Project Candidates

Open-source projects with browser-based benchmark suites in their repos. Organized by how well they fit chrome-ranger's model of running benchmarks against a matrix of Chrome versions × git refs.

## Tier 1: Excellent Fit

Automated browser benchmarks that support pointing at a custom Chrome binary with little or no modification.

### React (`facebook/react`)

- **URL:** https://github.com/facebook/react
- **Benchmarks:** `scripts/bench/`
- **Runner:** Lighthouse + `chrome-launcher`
- **Custom Chrome:** `CHROME_PATH` env var (native to chrome-launcher)
- **Measures:** First Meaningful Paint, User Timings (performance marks), rendering duration
- **Scenarios:** Hacker News clone, class components, functional components, direct `createElement`
- **Why it fits:** Cleanest integration path. `CHROME_PATH=$CHROME_BIN yarn start` just works. No chromedriver version coupling. Supports `--headless` and `--benchmark=<name>` flags.
- **Run:** `CHROME_PATH=$CHROME_BIN yarn --cwd scripts/bench start --headless`

### Lit (`lit/lit`)

- **URL:** https://github.com/lit/lit
- **Benchmarks:** `packages/benchmarks/`
- **Runner:** [Tachometer](https://github.com/google/tachometer)
- **Custom Chrome:** Tachometer's `browser.binary` config field
- **Measures:** Render time, update time, nop-update time for lit-html templates and LitElement components
- **Why it fits:** Each benchmark has its own `tachometer.json` config. Tachometer auto-samples until statistical significance. Also supports `cpuThrottlingRate`. Depends on `chromedriver` (version must match Chrome binary — adds friction).
- **Run:** `npx tachometer --config packages/benchmarks/tachometer.json --browser chrome`

### Preact (`preactjs/preact` + `preactjs/benchmarks`)

- **URL:** https://github.com/preactjs/preact
- **Benchmarks:** `benchmarks/` (git submodule pointing to `preactjs/benchmarks`)
- **Runner:** Tachometer (wrapped by custom `preact-bench` CLI with Vite dev server)
- **Custom Chrome:** Tachometer's `browser.binary` config field
- **Measures:** DOM rendering performance (todo app operations, many-updates, table replace1k), memory via `usedJSHeapSize`
- **Why it fits:** Same Tachometer foundation as Lit. CLI supports `--browser chrome | chrome-headless | firefox | safari | edge` and `--trace` for Chrome tracing.
- **Run:** `pnpm bench apps/todo/todo.html -d preact@local -b chrome-headless`

### js-framework-benchmark (`krausest/js-framework-benchmark`)

- **URL:** https://github.com/krausest/js-framework-benchmark
- **Benchmarks:** Root project (benchmark runner, not a library)
- **Runner:** Puppeteer + Chrome DevTools Protocol
- **Custom Chrome:** `--chromeBinary` flag
- **Measures:** DOM create/update/delete operations on large tables via Chrome timeline entries
- **Why it fits:** Already tracks results per Chrome version with git tags (`chrome100`, `chrome131`, `chrome144`). The `--chromeBinary` flag maps directly to `CHROME_BIN`. Tests 100+ framework implementations.
- **Run:** `npm run bench -- --framework keyed/vanillajs --chromeBinary $CHROME_BIN`

### Angular (`angular/angular`)

- **URL:** https://github.com/angular/angular
- **Benchmarks:** `modules/benchmarks/`
- **Runner:** `@angular/benchpress` (Selenium WebDriver)
- **Custom Chrome:** ChromeOptions in WebDriver config
- **Measures:** Script execution time, render/layout time, GC time and frequency, frame smoothness
- **Why it fits:** Real browser benchmarks with rich metrics. Env vars: `PERF_SAMPLE_SIZE`, `PERF_FORCE_GC`, `PERF_DRYRUN`.
- **Complexity:** Bazel build system adds significant setup overhead.

## Tier 2: Good Fit (minor patching needed)

Browser benchmarks that need a small code change to accept a custom Chrome binary.

### styled-components (`styled-components/styled-components`)

- **URL:** https://github.com/styled-components/styled-components
- **Benchmarks:** `packages/benchmarks/`
- **Runner:** Puppeteer
- **Custom Chrome:** Needs one-line patch: `executablePath: process.env.CHROME_BIN` in `puppeteer.launch()`
- **Measures:** Mean rendering time with stddev for mounting/updating component trees
- **Scenarios:** Mount deep tree, mount wide tree, update dynamic styles. Compares styled-components, emotion, aphrodite, goober, styletron, styled-jsx, react-native-web, inline styles.
- **Run:** `yarn run benchmarks`

### Babylon.js (`BabylonJS/Babylon.js`)

- **URL:** https://github.com/BabylonJS/Babylon.js
- **Benchmarks:** `packages/tools/tests/test/performance/`
- **Runner:** Playwright
- **Custom Chrome:** Needs minor patch to pass `executablePath` through
- **Measures:** WebGL/WebGPU rendering frame time with statistical outlier removal
- **Notes:** Config-driven via `config.json` (tests by Playground ID). Compares "stable" vs "dev" builds with configurable threshold (default 5%). Very large project with complex build.

### GoogleChromeLabs/css-selector-benchmark

- **URL:** https://github.com/GoogleChromeLabs/css-selector-benchmark
- **Runner:** Puppeteer + Chrome PerfTestRunner
- **Measures:** CSS selector matching and style recalculation
- **Why it fits:** Built by Chrome Labs to measure Chrome rendering internals. Puppeteer with configurable browser binary. CSS selector perf varies across Chrome releases.
- **Run:** `npm run benchmark example`

## Tier 3: Manual HTML (no automation)

Browser performance pages with no automated harness. Would need a Puppeteer/Playwright wrapper.

| Project | Location | Notes |
|---------|----------|-------|
| **ProseMirror** | `demo/bench/` | Manual HTML with `Date.now()` timing. Measures typing/mutation in editor. |
| **Konva.js** | `test/performance/` | Canvas-based bunnymark and element creation benchmarks. |
| **Three.js** | `examples/webgl_performance.html` etc. | WebGL/WebGPU demo pages, not test harnesses. |

## No Browser Benchmarks Found

These projects were checked but have no browser-based benchmark suites in their repos:

- **Svelte** — `benchmarking/` exists but runs entirely in Node.js (reactivity signals, SSR)
- **Vue** — `packages/reactivity/__benchmarks__/` uses vitest bench (Node.js)
- **SolidJS, Inferno, Million.js** — no benchmark directory; rely on external js-framework-benchmark
- **PixiJS, GSAP, Paper.js** — no benchmark directory
- **D3, Chart.js, Observable Plot** — no benchmark directory
- **CodeMirror, Lexical, Monaco** — no benchmark directory
- **Emotion** — no benchmark directory
- **Immer, RxJS, date-fns, dayjs, luxon** — no benchmark directory

## Recommendations

**React** is the best first target. `chrome-launcher` natively reads `CHROME_PATH`, there's no chromedriver coupling, setup is simple, and the benchmark scenarios are well-defined. Example chrome-ranger config:

```yaml
command: CHROME_PATH=$CHROME_BIN yarn --cwd scripts/bench start --headless
setup: yarn install
iterations: 10
warmup: 2

chrome:
  versions:
    - "120.0.6099.109"
    - "130.0.6723.58"

code:
  repo: .
  refs:
    - main
    - v18.3.1
```

**Lit** is the simplest integration if chromedriver version matching is handled. Tachometer configs are already structured for automated comparison.

**styled-components** is appealing for cross-library comparison (CSS-in-JS performance across Chrome versions) with a one-line Puppeteer patch.

**js-framework-benchmark** is the canonical benchmark runner — it was practically built for this use case and already accepts `--chromeBinary`.
