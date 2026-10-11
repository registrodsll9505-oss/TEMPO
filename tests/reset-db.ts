import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Borra y recrea el esquema de la base de pruebas, y aplica todas las migraciones. */
export async function resetTestDatabase(): Promise<string> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Define TEST_DATABASE_URL para ejecutar estas pruebas.");
  const name = new URL(url).pathname.slice(1);
  if (!/test|prueba/i.test(name)) {
    throw new Error(`Por seguridad, la base de pruebas debe llamarse con "test" (recibido: ${name}).`);
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  return url;
}
