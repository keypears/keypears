import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run test files sequentially (not in parallel)
    // This is necessary because tests share a database and need isolation
    fileParallelism: false,
    // Set NODE_ENV=test for low difficulty (see difficultyForName in lib)
    env: {
      NODE_ENV: "test",
    },
  },
});
