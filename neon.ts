import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    session: {
      name: "Pact Session",
      source: "./neon/functions/session/index.ts",
    },
    aigateway: {
      name: "Pact AI Gateway",
      source: "./neon/functions/aigateway/index.ts",
    },
    agentexecutor: {
      name: "Pact Agent Executor",
      source: "./neon/functions/agentexecutor/index.ts",
    },
    readapi: {
      name: "Pact Read API",
      source: "./neon/functions/readapi/index.ts",
    },
  },
});
