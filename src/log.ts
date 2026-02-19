const DEBUG = process.env.DEBUG === "chrome-ranger";

export function log(message: string): void {
  process.stderr.write(message + "\n");
}

export function logError(message: string, err?: unknown): void {
  process.stderr.write(`error: ${message}\n`);
  if (DEBUG && err instanceof Error && err.stack) {
    process.stderr.write(err.stack + "\n");
  }
}
