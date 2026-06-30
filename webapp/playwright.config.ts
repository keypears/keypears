import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "https://keypears.test",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-webgpu",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--headless=new",
            "--enable-unsafe-webgpu",
            "--use-angle=metal",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "bun run dev:e2e:keypears",
    url: "https://keypears.test",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
