/**
 * Crea (o recrea) la empresa de demostración de TEMPO.
 *
 * Todo lo que genera es ficticio: empresa, personas, proveedores y turnos. La empresa queda
 * marcada con is_demo y la interfaz la identifica como "Datos de demostración".
 * Solo toca la empresa demo y sus usuarios @tempo.example; nunca otros datos.
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { addDays, shiftFromStart, startOfWeek, todayIn } from "../src/lib/time";

const ZONE = "America/Bogota";
const DEMO_LEGAL_NAME = "Operadora Andina Demo S.A.S.";
const DEMO_USERS = [
  { email: "demo@tempo.example", name: "Administración Demo", role: "admin_empresa" as const },
  { email: "coordinacion@tempo.example", name: "Coordinación Demo", role: "coordinador" as const },
  { email: "auditoria@tempo.example", name: "Auditoría Demo", role: "auditor" as const },
];

async function main() {
  const url = process.env.SEED_URL ?? process.env.DATABASE_URL;
  const password = process.env.DEMO_PASSWORD;
  if (!url) throw new Error("Falta DATABASE_URL.");
  if (!password || password.length < 10) throw new Error("Define DEMO_PASSWORD (mínimo 10 caracteres) para crear los usuarios de demostración.");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const s = schema;

  await db.transaction(async (tx) => {
    // Limpieza acotada a la demo.
    await tx.delete(s.organizations).where(eq(s.organizations.legalName, DEMO_LEGAL_NAME));
    await tx.delete(s.users).where(inArray(s.users.email, DEMO_USERS.map((u) => u.email)));

    const [org] = await tx
      .insert(s.organizations)
      .values({ legalName: DEMO_LEGAL_NAME, tradeName: "Centro Andino Demo", taxId: "000.000.000-0 (ficticio)", timezone: ZONE, isDemo: true })
      .returning();

    const passwordHash = await hashPassword(password);
    const userIds: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const [user] = await tx.insert(s.users).values({ email: u.email, name: u.name, passwordHash }).returning();
      userIds[u.role] = user.id;
      await tx.insert(s.memberships).values({ orgId: org.id, userId: user.id, role: u.role });
    }
    const coordinator = userIds.coordinador;

    const [principal, norte] = await tx
      .insert(s.sites)
      .values([
        { orgId: org.id, name: "Sede Principal", code: "PPAL", address: "Calle Ficticia 1 # 2-34" },
        { orgId: org.id, name: "Sede Norte", code: "NORTE", address: "Avenida de Ejemplo 56 # 7-89" },
      ])
      .returning();

    const areaRows = await tx
      .insert(s.areas)
      .values([
        { orgId: org.id, siteId: principal.id, name: "Seguridad", color: "azul", costCenter: "CC-110" },
        { orgId: org.id, siteId: principal.id, name: "Parqueadero", color: "naranja", costCenter: "CC-120" },
        { orgId: org.id, siteId: principal.id, name: "Servicios generales", color: "verde", costCenter: "CC-130" },
        { orgId: org.id, siteId: principal.id, name: "Mantenimiento", color: "morado", costCenter: "CC-140" },
        { orgId: org.id, siteId: principal.id, name: "Atención al cliente", color: "rosa", costCenter: "CC-150" },
        { orgId: org.id, siteId: norte.id, name: "Seguridad Norte", color: "indigo", costCenter: "CC-210" },
        { orgId: org.id, siteId: norte.id, name: "Aseo Norte", color: "menta", costCenter: "CC-230" },
      ])
      .returning();
    const area = Object.fromEntries(areaRows.map((a) => [a.name, a.id]));

    const positionRows = await tx
      .insert(s.positions)
      .values(
        ["Guarda de seguridad", "Auxiliar de parqueadero", "Operario de aseo", "Técnico de mantenimiento", "Anfitrión de servicio", "Supervisor de turno"].map((name) => ({
          orgId: org.id,
          name,
        })),
      )
      .returning();
    const position = Object.fromEntries(positionRows.map((p) => [p.name, p.id]));

    const SECURITY = "Vigilancia Ejemplo Ltda. (ficticia)";
    const CLEANING = "Aseo Modelo S.A.S. (ficticia)";
    type P = { code: string; name: string; area: string; site: string; position: string; provider?: string };
    const roster: P[] = [
      { code: "SEG-01", name: "Camilo Ibáñez Roa", area: "Seguridad", site: principal.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "SEG-02", name: "Yolanda Pinto Vera", area: "Seguridad", site: principal.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "SEG-03", name: "Óscar Tovar Nieto", area: "Seguridad", site: principal.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "SEG-04", name: "Rubiela Cano Díaz", area: "Seguridad", site: principal.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "PAR-01", name: "Ferney Solarte Mina", area: "Parqueadero", site: principal.id, position: "Auxiliar de parqueadero" },
      { code: "PAR-02", name: "Leidy Urrutia Paz", area: "Parqueadero", site: principal.id, position: "Auxiliar de parqueadero" },
      { code: "PAR-03", name: "Jhon Arcos Bolaños", area: "Parqueadero", site: principal.id, position: "Auxiliar de parqueadero" },
      { code: "PAR-04", name: "Maritza Chaux Orozco", area: "Parqueadero", site: principal.id, position: "Supervisor de turno" },
      { code: "ASE-01", name: "Nubia Zemanate Rivas", area: "Servicios generales", site: principal.id, position: "Operario de aseo", provider: CLEANING },
      { code: "ASE-02", name: "Wilson Imbachí Ledezma", area: "Servicios generales", site: principal.id, position: "Operario de aseo", provider: CLEANING },
      { code: "ASE-03", name: "Aura Guzmán Collazos", area: "Servicios generales", site: principal.id, position: "Operario de aseo", provider: CLEANING },
      { code: "MAN-01", name: "Hernán Fajardo Illera", area: "Mantenimiento", site: principal.id, position: "Técnico de mantenimiento" },
      { code: "MAN-02", name: "Diana Realpe Muñoz", area: "Mantenimiento", site: principal.id, position: "Técnico de mantenimiento" },
      { code: "ATC-01", name: "Sofía Belalcázar Lemos", area: "Atención al cliente", site: principal.id, position: "Anfitrión de servicio" },
      { code: "ATC-02", name: "Mateo Garcés Quilindo", area: "Atención al cliente", site: principal.id, position: "Anfitrión de servicio" },
      { code: "SEN-01", name: "Álvaro Piamba Cerón", area: "Seguridad Norte", site: norte.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "SEN-02", name: "Gloria Sandoval Erazo", area: "Seguridad Norte", site: norte.id, position: "Guarda de seguridad", provider: SECURITY },
      { code: "ASN-01", name: "Élmer Campo Ruiz", area: "Aseo Norte", site: norte.id, position: "Operario de aseo", provider: CLEANING },
    ];
    const peopleRows = await tx
      .insert(s.people)
      .values(
        roster.map((p) => ({
          orgId: org.id,
          internalCode: p.code,
          fullName: p.name,
          siteId: p.site,
          areaId: area[p.area],
          positionId: position[p.position],
          employmentType: p.provider ? ("contratista" as const) : ("empleado_directo" as const),
          providerName: p.provider ?? null,
          contractType: p.provider ? null : "Término indefinido",
          agreedWeeklyHours: p.provider ? null : "42",
          startDate: "2025-02-03",
        })),
      )
      .returning();
    const person = Object.fromEntries(peopleRows.map((p) => [p.internalCode, p]));

    const templateRows = await tx
      .insert(s.shiftTemplates)
      .values([
        { orgId: org.id, name: "Mañana", code: "M", startTime: "06:00", durationMinutes: 480, breakMinutes: 30, breakTreatment: "por_definir" as const },
        { orgId: org.id, name: "Tarde", code: "T", startTime: "14:00", durationMinutes: 480, breakMinutes: 30, breakTreatment: "por_definir" as const },
        { orgId: org.id, name: "Noche", code: "N", startTime: "22:00", durationMinutes: 480, breakMinutes: 30, breakTreatment: "por_definir" as const },
        { orgId: org.id, name: "Administrativo", code: "A", startTime: "08:00", durationMinutes: 540, breakMinutes: 60, breakTreatment: "no_remunerada" as const },
        { orgId: org.id, name: "Refuerzo de mediodía", code: "R", startTime: "11:00", durationMinutes: 240, breakMinutes: 0, breakTreatment: "por_definir" as const },
      ])
      .returning();
    const template = Object.fromEntries(templateRows.map((t) => [t.code, t]));

    type Status = (typeof s.shiftStatusEnum.enumValues)[number];
    const rows: (typeof s.shifts.$inferInsert)[] = [];
    const add = (o: { date: string; code?: string; start?: string; minutes?: number; who: string | null; areaName: string; status: Status; notes?: string }) => {
      const t = o.code ? template[o.code] : undefined;
      const { startsAt, endsAt } = shiftFromStart(o.date, t?.startTime ?? o.start!, t?.durationMinutes ?? o.minutes!, ZONE);
      const p = o.who ? person[o.who] : undefined;
      const areaRow = areaRows.find((a) => a.name === o.areaName)!;
      rows.push({
        orgId: org.id,
        siteId: areaRow.siteId,
        areaId: areaRow.id,
        personId: p?.id ?? null,
        positionId: p?.positionId ?? null,
        templateId: t?.id ?? null,
        startsAt,
        endsAt,
        breakMinutes: t?.breakMinutes ?? 0,
        breakTreatment: t?.breakTreatment ?? "por_definir",
        status: o.status,
        notes: o.notes ?? null,
        createdBy: coordinator,
        updatedBy: coordinator,
      });
    };

    const monday = startOfWeek(todayIn(ZONE));
    // Semana anterior: publicada. Semana actual: aprobada y publicada, con pendientes. Siguiente: en preparación.
    for (const week of [-1, 0, 1]) {
      const base: Status = week === -1 ? "publicado" : week === 0 ? "publicado" : "borrador";
      for (let d = 0; d < 7; d++) {
        const date = addDays(monday, week * 7 + d);
        const dayIndex = (week + 1) * 7 + d;
        const weekend = d >= 5;
        const st = (alt: Status): Status => (week === 0 && d >= 4 ? alt : base);

        // Seguridad, sede principal: rotación 2 mañanas, 2 tardes, 2 noches, 2 descansos.
        const cycle = ["M", "M", "T", "T", "N", "N", null, null];
        ["SEG-01", "SEG-02", "SEG-03", "SEG-04"].forEach((code, i) => {
          const slot = cycle[(dayIndex + i * 2) % 8];
          if (slot) add({ date, code: slot, who: code, areaName: "Seguridad", status: st("aprobado") });
        });

        // Parqueadero: dos auxiliares entre semana, un tercero el fin de semana y refuerzos.
        const flip = (week + 2) % 2 === 0;
        if (!weekend) {
          add({ date, code: "M", who: flip ? "PAR-01" : "PAR-02", areaName: "Parqueadero", status: st("aprobado") });
          add({ date, code: "T", who: flip ? "PAR-02" : "PAR-01", areaName: "Parqueadero", status: st("pendiente_aprobacion") });
          add({ date, code: "A", who: "PAR-04", areaName: "Parqueadero", status: st("aprobado") });
          if (d === 1 || d === 3) add({ date, code: "R", who: "PAR-03", areaName: "Parqueadero", status: st("aprobado") });
        } else {
          add({ date, code: "M", who: "PAR-03", areaName: "Parqueadero", status: st("aprobado") });
          add({ date, code: "T", who: null, areaName: "Parqueadero", status: week === 1 ? "borrador" : st("pendiente_aprobacion"), notes: "Fin de semana. Falta asignar." });
        }

        // Servicios generales: cada persona trabaja cinco días.
        if (!weekend) add({ date, code: "M", who: "ASE-01", areaName: "Servicios generales", status: st("aprobado") });
        if (d >= 1 && d <= 5) add({ date, code: "M", who: "ASE-02", areaName: "Servicios generales", status: st("aprobado") });
        if (d >= 2) add({ date, code: "T", who: d === 3 && week === 1 ? null : "ASE-03", areaName: "Servicios generales", status: st("pendiente_aprobacion") });

        // Mantenimiento: jornada administrativa entre semana y un turno el sábado.
        if (!weekend) add({ date, code: "A", who: "MAN-01", areaName: "Mantenimiento", status: st("aprobado") });
        if (d <= 3) add({ date, code: "A", who: "MAN-02", areaName: "Mantenimiento", status: st("aprobado") });
        if (d === 5) add({ date, code: "M", who: "MAN-02", areaName: "Mantenimiento", status: st("aprobado") });

        // Atención al cliente: horario libre, sin plantilla.
        if (d === 0 || (d >= 2 && d <= 5)) add({ date, start: "10:00", minutes: 480, who: "ATC-01", areaName: "Atención al cliente", status: st("aprobado") });
        if (d === 1) add({ date, start: "10:00", minutes: 480, who: "ATC-02", areaName: "Atención al cliente", status: st("aprobado") });
        if (d >= 3) add({ date, start: "12:00", minutes: 480, who: "ATC-02", areaName: "Atención al cliente", status: st("pendiente_aprobacion") });

        // Sede Norte.
        if (!weekend) add({ date, code: d % 2 === 0 ? "M" : "T", who: "SEN-01", areaName: "Seguridad Norte", status: st("aprobado") });
        if (d !== 6) add({ date, code: "N", who: d === 2 ? null : "SEN-02", areaName: "Seguridad Norte", status: st("pendiente_aprobacion"), notes: d === 2 ? "Descanso de la titular. Falta reemplazo." : undefined });
        if (!weekend) add({ date, code: "M", who: "ASN-01", areaName: "Aseo Norte", status: st("aprobado") });
      }
    }
    // Un turno cancelado, para que la demo muestre ese estado.
    add({ date: addDays(monday, 2), start: "18:00", minutes: 180, who: null, areaName: "Atención al cliente", status: "cancelado", notes: "Evento reprogramado." });

    for (let i = 0; i < rows.length; i += 200) await tx.insert(s.shifts).values(rows.slice(i, i + 200));

    await tx.insert(s.auditEvents).values([
      { orgId: org.id, actorUserId: userIds.admin_empresa, actorName: "Administración Demo", action: "empresa.crear", entityType: "empresa", entityId: org.id, summary: "Se creó la empresa Centro Andino Demo." },
      { orgId: org.id, actorUserId: coordinator, actorName: "Coordinación Demo", action: "demo.cargar", entityType: "turno", summary: `Se cargaron ${rows.length} turnos de demostración para tres semanas.` },
    ]);

    console.log(`Empresa demo creada: ${roster.length} personas, ${rows.length} turnos (${monday} ± 1 semana).`);
  });

  await client.end();
  console.log("Usuarios de demostración (contraseña: la de DEMO_PASSWORD):");
  for (const u of DEMO_USERS) console.log(`  ${u.email}  →  ${u.role}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
