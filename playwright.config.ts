import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const testDatabase = process.env.TEST_DATABASE_URL ?? "";

/**
 * Pruebas de extremo a extremo. Levantan la aplicación compilada contra la base de pruebas
 * (TEST_DATABASE_URL), que se borra y se siembra con la empresa demo en cada ejecución.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/ingresar`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: testDatabase },
  },
});
