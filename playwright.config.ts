import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "3000";
const apiPort = process.env.E2E_API_PORT ?? "3001";
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev:api",
      url: `${apiOrigin}/api/v1/health`,
      env: { PORT: apiPort, WEB_ORIGIN: webOrigin },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web",
      url: webOrigin,
      env: { PORT: webPort, NEXT_PUBLIC_API_URL: `${apiOrigin}/api/v1` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
