import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/*/test/**/*.test.ts", "services/*/test/**/*.test.ts"],
  },
});
