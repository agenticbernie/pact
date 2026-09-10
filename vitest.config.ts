import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/*/test/**/*.test.ts", "services/*/test/**/*.test.ts", "apps/edge/test/**/*.test.ts", "supabase/functions/**/test/**/*.vitest.test.ts"],
  },
});
