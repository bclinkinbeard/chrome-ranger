import { releaseLock } from "./lockfile.js";

let handlerInstalled = false;
let sigintHandler: () => void;
let sigtermHandler: () => void;

export function installSignalHandlers(
  projectDir: string,
  cleanup: () => void,
): AbortController {
  const controller = new AbortController();
  let handling = false;

  const handler = (signal: string) => {
    if (handling) {
      // Double signal — force exit
      process.exit(1);
    }
    handling = true;

    controller.abort();
    cleanup();

    releaseLock(projectDir)
      .catch(() => {})
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };

  sigintHandler = () => handler("SIGINT");
  sigtermHandler = () => handler("SIGTERM");

  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);
  handlerInstalled = true;

  return controller;
}

export function removeSignalHandlers(): void {
  if (!handlerInstalled) return;
  process.removeListener("SIGINT", sigintHandler);
  process.removeListener("SIGTERM", sigtermHandler);
  handlerInstalled = false;
}
