import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/app/",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: "pnpm --filter @planejador/api dev:test",
      url: "http://127.0.0.1:3001/projects",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @planejador/web dev",
      url: "http://127.0.0.1:4174/app/",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @planejador/marketing dev",
      url: "http://127.0.0.1:4173/",
      env: { ASTRO_DEV_BACKGROUND: "0" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
