import "server-only";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { TenantTx } from "@/db/client";
import { areas, auditEvents, memberships, people, positions, shifts, shiftTemplates, sites, users } from "@/db/schema";

/** Consultas de lectura. Todas reciben una transacción ya limitada a la empresa (withTenant). */

export function listSites(tx: TenantTx) {
  return tx.select().from(sites).orderBy(desc(sites.active), asc(sites.name));
}

export function listAreas(tx: TenantTx) {
  return tx
    .select({
      id: areas.id,
      name: areas.name,
      color: areas.color,
      costCenter: areas.costCenter,
      active: areas.active,
      siteId: areas.siteId,
      siteName: sites.name,
    })
    .from(areas)
    .innerJoin(sites, eq(sites.id, areas.siteId))
    .orderBy(desc(areas.active), asc(sites.name), asc(areas.name));
}

export function listPositions(tx: TenantTx) {
  return tx.select().from(positions).orderBy(desc(positions.active), asc(positions.name));
}

export function listPeople(tx: TenantTx) {
  return tx
    .select({
      id: people.id,
      internalCode: people.internalCode,
      fullName: people.fullName,
      active: people.active,
      siteId: people.siteId,
      areaId: people.areaId,
      positionId: people.positionId,
      employmentType: people.employmentType,
      providerName: people.providerName,
      contractType: people.contractType,
      agreedWeeklyHours: people.agreedWeeklyHours,
      startDate: people.startDate,
      endDate: people.endDate,
      notes: people.notes,
      siteName: sites.name,
      areaName: areas.name,
      areaColor: areas.color,
      positionName: positions.name,
    })
    .from(people)
    .leftJoin(sites, eq(sites.id, people.siteId))
    .leftJoin(areas, eq(areas.id, people.areaId))
    .leftJoin(positions, eq(positions.id, people.positionId))
    .orderBy(desc(people.active), asc(people.fullName));
}

export function listTemplates(tx: TenantTx) {
  return tx
    .select({
      id: shiftTemplates.id,
      name: shiftTemplates.name,
      code: shiftTemplates.code,
      startTime: shiftTemplates.startTime,
      durationMinutes: shiftTemplates.durationMinutes,
      breakMinutes: shiftTemplates.breakMinutes,
      breakTreatment: shiftTemplates.breakTreatment,
      areaId: shiftTemplates.areaId,
      positionId: shiftTemplates.positionId,
      active: shiftTemplates.active,
      areaName: areas.name,
      positionName: positions.name,
    })
    .from(shiftTemplates)
    .leftJoin(areas, eq(areas.id, shiftTemplates.areaId))
    .leftJoin(positions, eq(positions.id, shiftTemplates.positionId))
    .orderBy(desc(shiftTemplates.active), asc(shiftTemplates.startTime), asc(shiftTemplates.name));
}

export function listMembers(tx: TenantTx) {
  return tx
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      active: memberships.active,
      mustChangePassword: users.mustChangePassword,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .orderBy(desc(memberships.active), asc(users.name));
}

export type ShiftRow = {
  id: string;
  siteId: string;
  areaId: string;
  personId: string | null;
  positionId: string | null;
  templateId: string | null;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  breakTreatment: "remunerada" | "no_remunerada" | "por_definir";
  status: (typeof shifts.$inferSelect)["status"];
  notes: string | null;
  version: number;
  updatedBy: string | null;
  personName: string | null;
  areaName: string;
  areaColor: string;
  positionName: string | null;
  siteName: string;
};

/** Turnos que tocan el intervalo [from, to). */
export async function listShiftsInRange(
  tx: TenantTx,
  range: { from: Date; to: Date },
  siteId: string | null,
): Promise<ShiftRow[]> {
  const rows = await tx
    .select({
      id: shifts.id,
      siteId: shifts.siteId,
      areaId: shifts.areaId,
      personId: shifts.personId,
      positionId: shifts.positionId,
      templateId: shifts.templateId,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      breakMinutes: shifts.breakMinutes,
      breakTreatment: shifts.breakTreatment,
      status: shifts.status,
      notes: shifts.notes,
      version: shifts.version,
      updatedBy: shifts.updatedBy,
      personName: people.fullName,
      areaName: areas.name,
      areaColor: areas.color,
      positionName: positions.name,
      siteName: sites.name,
    })
    .from(shifts)
    .innerJoin(areas, eq(areas.id, shifts.areaId))
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .leftJoin(people, eq(people.id, shifts.personId))
    .leftJoin(positions, eq(positions.id, shifts.positionId))
    .where(
      and(lt(shifts.startsAt, range.to), gt(shifts.endsAt, range.from), siteId ? eq(shifts.siteId, siteId) : undefined),
    )
    .orderBy(asc(shifts.startsAt), asc(people.fullName));
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() }));
}

export function listAudit(tx: TenantTx, options: { limit: number; entityType?: string; entityId?: string }) {
  return tx
    .select()
    .from(auditEvents)
    .where(
      and(
        options.entityType ? eq(auditEvents.entityType, options.entityType) : undefined,
        options.entityId ? eq(auditEvents.entityId, options.entityId) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(options.limit);
}

export async function countRows(tx: TenantTx) {
  const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  return {
    sites: await one(tx.select({ n }).from(sites).where(eq(sites.active, true))),
    areas: await one(tx.select({ n }).from(areas).where(eq(areas.active, true))),
    positions: await one(tx.select({ n }).from(positions).where(eq(positions.active, true))),
    people: await one(tx.select({ n }).from(people).where(eq(people.active, true))),
    templates: await one(tx.select({ n }).from(shiftTemplates).where(eq(shiftTemplates.active, true))),
    shifts: await one(tx.select({ n }).from(shifts)),
  };
}
