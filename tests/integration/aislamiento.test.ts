import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { shiftFromStart } from "@/lib/time";
import { resetTestDatabase } from "../reset-db";

/**
 * Aislamiento entre empresas y reglas de integridad, contra un PostgreSQL real.
 * Estas pruebas ejercitan el mismo `withTenant` que usa la aplicación.
 */

type Db = typeof import("@/db/client");
let db: Db;

const ZONE = "America/Bogota";
type Fixture = { org: string; site: string; area: string; person: string; shift: string; user: string };
let A: Fixture;
let B: Fixture;

async function fixture(label: string): Promise<Fixture> {
  const { systemDb } = db;
  const [org] = await systemDb.insert(s.organizations).values({ legalName: `Empresa ${label}`, tradeName: `Empresa ${label}` }).returning();
  const [user] = await systemDb.insert(s.users).values({ email: `${label.toLowerCase()}@prueba.example`, name: `Usuario ${label}`, passwordHash: "x" }).returning();
  await systemDb.insert(s.memberships).values({ orgId: org.id, userId: user.id, role: "admin_empresa" });
  const [site] = await systemDb.insert(s.sites).values({ orgId: org.id, name: `Sede ${label}`, code: "S1" }).returning();
  const [area] = await systemDb.insert(s.areas).values({ orgId: org.id, siteId: site.id, name: "Seguridad" }).returning();
  const [person] = await systemDb.insert(s.people).values({ orgId: org.id, internalCode: "P1", fullName: `Persona ${label}`, employmentType: "empleado_directo" }).returning();
  const [shift] = await systemDb
    .insert(s.shifts)
    .values({ orgId: org.id, siteId: site.id, areaId: area.id, personId: person.id, status: "aprobado", ...shiftFromStart("2026-10-12", "06:00", 480, ZONE) })
    .returning();
  await systemDb.insert(s.auditEvents).values({ orgId: org.id, actorName: "Sistema", action: "prueba", entityType: "empresa", summary: `Evento de ${label}` });
  return { org: org.id, site: site.id, area: area.id, person: person.id, shift: shift.id, user: user.id };
}

/** Código de error de PostgreSQL, esté donde esté en la cadena de causas. */
async function pgError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    let current: unknown = error;
    for (let i = 0; i < 5 && current; i++) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
      current = (current as { cause?: unknown }).cause;
    }
    return "ERROR_SIN_CODIGO";
  }
  return "SIN_ERROR";
}

beforeAll(async () => {
  await resetTestDatabase();
  db = await import("@/db/client");
  A = await fixture("A");
  B = await fixture("B");
});

describe("lectura", () => {
  it("cada empresa ve solo sus filas en todas las tablas de negocio", async () => {
    const { withTenant } = db;
    for (const [mine, other] of [[A, B], [B, A]] as const) {
      await withTenant(mine.org, async (tx) => {
        for (const table of [s.sites, s.areas, s.people, s.shifts, s.memberships, s.auditEvents]) {
          const rows = await tx.select({ orgId: table.orgId }).from(table);
          expect(rows.length).toBeGreaterThan(0);
          expect(rows.every((r) => r.orgId === mine.org)).toBe(true);
        }
        const orgs = await tx.select({ id: s.organizations.id }).from(s.organizations);
        expect(orgs).toEqual([{ id: mine.org }]);
        expect(await tx.select({ id: s.people.id }).from(s.people).where(eq(s.people.id, other.person))).toHaveLength(0);
        expect(await tx.select({ id: s.shifts.id }).from(s.shifts).where(eq(s.shifts.id, other.shift))).toHaveLength(0);
      });
    }
  });

  it("solo son visibles los usuarios con membresía en la empresa activa", async () => {
    const users = await db.withTenant(A.org, (tx) => tx.select({ id: s.users.id, email: s.users.email }).from(s.users));
    expect(users).toEqual([{ id: A.user, email: "a@prueba.example" }]);
  });

  it("el rol de la aplicación no puede leer hashes de contraseña ni sesiones", async () => {
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.select({ h: s.users.passwordHash }).from(s.users)))).toBe("42501");
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.select().from(s.sessions)))).toBe("42501");
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.select().from(s.loginAttempts)))).toBe("42501");
  });

  it("withTenant rechaza identificadores que no son UUID", async () => {
    await expect(db.withTenant("x' or '1'='1", async () => 1)).rejects.toThrow();
    await expect(db.withTenant("", async () => 1)).rejects.toThrow();
  });

  it("sin empresa fijada, el rol de la aplicación no ve nada", async () => {
    const rows = await db.systemDb.transaction(async (tx) => {
      await tx.execute(sql`set local role tempo_app`);
      return tx.select({ id: s.people.id }).from(s.people);
    });
    expect(rows).toHaveLength(0);
  });

  it("el contexto de empresa no se filtra a la siguiente transacción", async () => {
    await db.withTenant(A.org, (tx) => tx.select({ id: s.people.id }).from(s.people));
    const [row] = await db.systemDb.execute<{ org: string | null; role: string }>(sql`select current_setting('app.org_id', true) as org, current_user as role`);
    expect(row.org === null || row.org === "").toBe(true);
    expect(row.role).not.toBe("tempo_app");
  });
});

describe("escritura", () => {
  it("no se puede insertar una fila a nombre de otra empresa", async () => {
    const code = await pgError(() =>
      db.withTenant(A.org, (tx) => tx.insert(s.people).values({ orgId: B.org, internalCode: "X1", fullName: "Intruso", employmentType: "empleado_directo" })),
    );
    expect(code).toBe("42501");
  });

  it("actualizar o borrar filas ajenas no afecta nada", async () => {
    const updated = await db.withTenant(A.org, (tx) => tx.update(s.people).set({ fullName: "Alterado" }).where(eq(s.people.id, B.person)).returning());
    expect(updated).toHaveLength(0);
    const deleted = await db.withTenant(A.org, (tx) => tx.delete(s.shifts).where(eq(s.shifts.id, B.shift)).returning());
    expect(deleted).toHaveLength(0);
    const [person] = await db.systemDb.select().from(s.people).where(eq(s.people.id, B.person));
    expect(person.fullName).toBe("Persona B");
  });

  it("no se puede mover una fila propia a otra empresa", async () => {
    const code = await pgError(() => db.withTenant(A.org, (tx) => tx.update(s.people).set({ orgId: B.org }).where(eq(s.people.id, A.person))));
    expect(code).toBe("42501");
  });

  it("un turno propio no puede referenciar persona, área o sede de otra empresa", async () => {
    const times = shiftFromStart("2026-10-13", "06:00", 480, ZONE);
    const base = { orgId: A.org, siteId: A.site, areaId: A.area, ...times };
    for (const values of [{ ...base, personId: B.person }, { ...base, areaId: B.area }, { ...base, siteId: B.site }]) {
      expect(await pgError(() => db.withTenant(A.org, (tx) => tx.insert(s.shifts).values(values)))).toBe("23503");
    }
  });

  it("la auditoría no se puede modificar ni borrar", async () => {
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.update(s.auditEvents).set({ summary: "Alterado" })))).toBe("42501");
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.delete(s.auditEvents)))).toBe("42501");
  });

  it("solo se pueden eliminar turnos en borrador", async () => {
    const approved = await db.withTenant(A.org, (tx) => tx.delete(s.shifts).where(eq(s.shifts.id, A.shift)).returning());
    expect(approved).toHaveLength(0);
    const [draft] = await db.withTenant(A.org, (tx) =>
      tx.insert(s.shifts).values({ orgId: A.org, siteId: A.site, areaId: A.area, ...shiftFromStart("2026-10-20", "06:00", 480, ZONE) }).returning(),
    );
    const removed = await db.withTenant(A.org, (tx) => tx.delete(s.shifts).where(eq(s.shifts.id, draft.id)).returning());
    expect(removed).toHaveLength(1);
  });

  it("no se pueden borrar sedes, áreas ni personas, solo desactivarlas", async () => {
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.delete(s.people).where(eq(s.people.id, A.person))))).toBe("42501");
    expect(await pgError(() => db.withTenant(A.org, (tx) => tx.delete(s.sites)))).toBe("42501");
  });
});

describe("integridad de turnos", () => {
  const insert = (date: string, start: string, minutes: number, extra: Partial<typeof s.shifts.$inferInsert> = {}) =>
    db.withTenant(A.org, (tx) =>
      tx.insert(s.shifts).values({ orgId: A.org, siteId: A.site, areaId: A.area, personId: A.person, ...shiftFromStart(date, start, minutes, ZONE), ...extra }).returning(),
    );

  it("una persona no puede tener dos turnos que se crucen", async () => {
    expect(await pgError(() => insert("2026-10-12", "10:00", 480))).toBe("23P01");
  });

  it("un turno nocturno bloquea la madrugada del día siguiente", async () => {
    await insert("2026-10-14", "22:00", 480);
    expect(await pgError(() => insert("2026-10-15", "05:00", 120))).toBe("23P01");
  });

  it("turnos consecutivos sí se permiten", async () => {
    const [row] = await insert("2026-10-12", "14:00", 480);
    expect(row.id).toBeTruthy();
  });

  it("un turno cancelado no bloquea el horario", async () => {
    await insert("2026-10-16", "06:00", 480, { status: "cancelado" });
    const [row] = await insert("2026-10-16", "06:00", 480);
    expect(row.status).toBe("borrador");
  });

  it("los turnos vacantes pueden coincidir", async () => {
    await insert("2026-10-17", "06:00", 480, { personId: null });
    const [row] = await insert("2026-10-17", "06:00", 480, { personId: null });
    expect(row.personId).toBeNull();
  });

  it("rechaza turnos sin duración, de más de 24 horas o con pausa mayor que el turno", async () => {
    const start = new Date("2026-10-18T11:00:00Z");
    const raw = (endsAt: Date, breakMinutes = 0) =>
      pgError(() => db.withTenant(A.org, (tx) => tx.insert(s.shifts).values({ orgId: A.org, siteId: A.site, areaId: A.area, startsAt: start, endsAt, breakMinutes })));
    expect(await raw(start)).toBe("23514");
    expect(await raw(new Date(start.getTime() - 60_000))).toBe("23514");
    expect(await raw(new Date(start.getTime() + 25 * 3_600_000))).toBe("23514");
    expect(await raw(new Date(start.getTime() + 60 * 60_000), 60)).toBe("23514");
    expect(await raw(new Date(start.getTime() + 24 * 3_600_000))).toBe("SIN_ERROR");
  });

  it("un contratista exige empresa contratista solo en su tipo de vinculación", async () => {
    const code = await pgError(() =>
      db.withTenant(A.org, (tx) => tx.insert(s.people).values({ orgId: A.org, internalCode: "P9", fullName: "Directo", employmentType: "empleado_directo", providerName: "No aplica" })),
    );
    expect(code).toBe("23514");
  });
});
