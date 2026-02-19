import fs from "node:fs";
import path from "node:path";

const SCAFFOLD = `command: npx playwright test
# setup: npm ci
iterations: 5
warmup: 1
workers: 1

chrome:
  versions:
    - "120.0.6099.109"

code:
  repo: .
  refs:
    - main
`;

export async function initConfig(dir: string, force: boolean): Promise<void> {
  const configPath = path.join(dir, "chrome-ranger.yaml");

  if (!force && fs.existsSync(configPath)) {
    throw new Error(
      `error: chrome-ranger.yaml already exists. Use --force to overwrite.`
    );
  }

  fs.writeFileSync(configPath, SCAFFOLD);
}
