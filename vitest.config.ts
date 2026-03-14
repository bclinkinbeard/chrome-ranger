import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    globalSetup: ["test/setup.ts"],
    exclude: ["**/node_modules/**", "**/examples/**/lit/**"],
  },
});
