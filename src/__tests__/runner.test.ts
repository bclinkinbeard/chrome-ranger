import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { realpathSync } from "node:fs";
import { runIteration } from "../runner.js";
import type { IterationInput } from "../types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = realpathSync(await fs.mkdtemp(path.join(os.tmpdir(), "cr-runner-")));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeInput(overrides: Partial<IterationInput> = {}): IterationInput {
  return {
    id: "test-run-id",
    command: "echo hello",
    chromeBin: "/usr/bin/false",
    chromeVersion: "120.0.6099.109",
    ref: "main",
    sha: "abc1234567890",
    codeDir: tmpDir,
    iteration: 0,
    ...overrides,
  };
}

describe("runIteration", () => {
  it("captures stdout verbatim", async () => {
    const result = await runIteration(makeInput({ command: "echo hello" }));
    expect(result.stdout.trim()).toBe("hello");
  });

  it("captures stderr verbatim", async () => {
    const result = await runIteration(
      makeInput({ command: "echo err >&2" }),
    );
    expect(result.stderr.trim()).toBe("err");
  });

  it("captures exit code for success", async () => {
    const result = await runIteration(makeInput({ command: "true" }));
    expect(result.exitCode).toBe(0);
  });

  it("captures exit code for failure", async () => {
    const result = await runIteration(makeInput({ command: "exit 42" }));
    expect(result.exitCode).toBe(42);
  });

  it("sets all 6 env vars correctly", async () => {
    const result = await runIteration(
      makeInput({
        command: 'echo "$CHROME_BIN|$CHROME_VERSION|$CODE_REF|$CODE_SHA|$CODE_DIR|$ITERATION"',
        chromeBin: "/path/to/chrome",
        chromeVersion: "120.0.6099.109",
        ref: "main",
        sha: "abc123",
        iteration: 3,
      }),
    );
    expect(result.stdout.trim()).toBe(
      `/path/to/chrome|120.0.6099.109|main|abc123|${tmpDir}|3`,
    );
  });

  it("ITERATION is a string", async () => {
    const result = await runIteration(
      makeInput({ command: 'echo "$ITERATION"', iteration: 42 }),
    );
    expect(result.stdout.trim()).toBe("42");
  });

  it("durationMs is positive", async () => {
    const result = await runIteration(makeInput({ command: "true" }));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("timestamp is valid ISO 8601", async () => {
    const result = await runIteration(makeInput());
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it("empty stdout → empty string", async () => {
    const result = await runIteration(makeInput({ command: "true" }));
    expect(result.stdout).toBe("");
  });

  it("empty stderr → empty string", async () => {
    const result = await runIteration(makeInput({ command: "true" }));
    expect(result.stderr).toBe("");
  });

  it("never throws — failures encoded in result", async () => {
    const result = await runIteration(
      makeInput({ command: "nonexistent_command_xyz" }),
    );
    expect(result.exitCode).not.toBe(0);
  });

  it("id from input is passed through to result", async () => {
    const result = await runIteration(
      makeInput({ id: "my-custom-id" }),
    );
    expect(result.id).toBe("my-custom-id");
  });

  it("cwd is set to codeDir", async () => {
    const result = await runIteration(makeInput({ command: "pwd" }));
    expect(result.stdout.trim()).toBe(tmpDir);
  });

  it("inherits parent env vars (PATH)", async () => {
    const result = await runIteration(
      makeInput({ command: 'echo "$PATH"' }),
    );
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });
});
