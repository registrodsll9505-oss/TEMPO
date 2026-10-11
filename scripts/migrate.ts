import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  // Las migraciones usan la conexión directa cuando existe (los agrupadores de conexiones
  // no admiten todo lo que necesita una migración).
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL.");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migraciones aplicadas.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
