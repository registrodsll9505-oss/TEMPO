import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Falta la variable de entorno DATABASE_URL.");
}

// En desarrollo, Next recarga módulos; se reutiliza la conexión para no agotar el pool.
const globalForDb = globalThis as unknown as { __tempoSql?: ReturnType<typeof postgres> };
const client = globalForDb.__tempoSql ?? postgres(url, { max: 10, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.__tempoSql = client;

/**
 * Conexión privilegiada: NO aplica aislamiento por empresa.
 * Úsala solo en la capa de autenticación (usuarios, sesiones, alta de empresas).
 * Para cualquier dato de negocio usa `withTenant`.
 */
export const systemDb = drizzle(client, { schema });

export type TenantTx = Parameters<Parameters<typeof systemDb.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ejecuta `fn` en una transacción limitada a una empresa: fija app.org_id y cambia al rol
 * tempo_app, sobre el que rigen las políticas de Row-Level Security.
 */
export async function withTenant<T>(orgId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  if (!UUID.test(orgId)) throw new Error("Identificador de empresa inválido.");
  return systemDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    await tx.execute(sql`set local role tempo_app`);
    return fn(tx);
  });
}
