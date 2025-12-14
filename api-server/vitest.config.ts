import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run test files sequentially (not in parallel)
    // This is necessary because tests share a database and need isolation
    fileParallelism: false,
    // Set low registration difficulty for fast test execution
    // This overrides REGISTRATION_DIFFICULTY in src/constants.ts
    env: {
      TEST_REGISTRATION_DIFFICULTY: "256",
    },
  },
});
