import { defineConfig } from "vitest/config";

/**
 * Workspace-local Vitest config. The suites here cover the pure display
 * derivations (receipt truth, formatting) that the console must not get wrong;
 * they run in the node environment with no DOM or network.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
