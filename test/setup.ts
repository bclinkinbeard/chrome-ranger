import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export async function setup() {
  execSync("node_modules/.bin/tsup", { cwd: projectRoot, stdio: "pipe" });
}
