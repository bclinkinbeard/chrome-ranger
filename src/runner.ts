import { spawn } from "node:child_process";
import type { IterationInput, IterationResult } from "./types.js";

export function runIteration(input: IterationInput): Promise<IterationResult> {
  return new Promise((resolve) => {
    const timestamp = new Date().toISOString();
    const start = performance.now();

    const env = {
      ...process.env,
      CHROME_BIN: input.chromeBin,
      CHROME_VERSION: input.chromeVersion,
      CODE_REF: input.ref,
      CODE_SHA: input.sha,
      CODE_DIR: input.codeDir,
      ITERATION: String(input.iteration),
    };

    const child = spawn(input.command, {
      cwd: input.codeDir,
      shell: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", () => {
      const durationMs = Math.round(performance.now() - start);
      resolve({
        id: input.id,
        chrome: input.chromeVersion,
        ref: input.ref,
        sha: input.sha,
        iteration: input.iteration,
        timestamp,
        durationMs,
        exitCode: 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });

    child.on("close", (code, signal) => {
      const durationMs = Math.round(performance.now() - start);
      let exitCode = code ?? 1;
      if (signal) {
        // Killed by signal — convention: 128 + signal number
        const signalNumbers: Record<string, number> = {
          SIGHUP: 1,
          SIGINT: 2,
          SIGQUIT: 3,
          SIGTERM: 15,
        };
        exitCode = 128 + (signalNumbers[signal] ?? 1);
      }

      resolve({
        id: input.id,
        chrome: input.chromeVersion,
        ref: input.ref,
        sha: input.sha,
        iteration: input.iteration,
        timestamp,
        durationMs,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });
  });
}
