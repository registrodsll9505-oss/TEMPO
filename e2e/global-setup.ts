import "dotenv/config";
import { execFileSync } from "node:child_process";
import { resetTestDatabase } from "../tests/reset-db";

export default async function globalSetup() {
  const url = await resetTestDatabase();
  if (!process.env.DEMO_PASSWORD) throw new Error("Define DEMO_PASSWORD para sembrar la empresa demo de las pruebas.");
  execFileSync("npx", ["tsx", "scripts/seed-demo.ts"], { stdio: "inherit", env: { ...process.env, SEED_URL: url } });
}
