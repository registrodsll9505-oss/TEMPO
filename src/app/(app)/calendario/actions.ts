"use server";

import { refresh } from "next/cache";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { z } from "zod";
import type { TenantTx } from "@/db/client";
import { areas, people, positions, shifts, shiftTemplates, sites } from "@/db/schema";
import { tenantAction, UserError, zOptionalUuid, zUuid, type ActionState } from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/context";
import { getAuth } from "@/lib/auth/context";
import { withTenant } from "@/db/client";
import { listAudit } from "@/lib/queries";
import { checkTransition, isEditable, STATUS_LABELS } from "@/lib/shift-status";
import { addDays, instantToLocal, isIsoDate, isTime, localToInstant, shiftFromTimes, toZoned } from "@/lib/time";

type Result = NonNullable<ActionState>;

const zDate = z.string().refine(isIsoDate, "Fecha inválida.");
const zTime = z.string().refine(isTime, "Hora inválida.");
const zVersion = z.number().int().positive();

const STALE = "Otra persona cambió este turno mientras lo tenías abierto. Vuelve a abrirlo para ver la versión actual.";

async function siteZone(tx: TenantTx, auth: AuthContext, siteId: string): Promise<string> {
  const [site] = await tx.select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new UserError("La sede seleccionada no existe.");
  if (!site.active) throw new UserError("La sede está inactiva.");
  return site.timezone ?? auth.org.timezone;
}

function describe(shift: { startsAt: Date; endsAt: Date }, zone: string, personName: string | null): string {
  const start = toZoned(shift.startsAt, zone);
  const end = toZoned(shift.endsAt, zone);
  return `${personName ?? "vacante"}, ${start.toFormat("ccc d LLL HH:mm")} a ${end.toFormat("HH:mm")}`;
}

const saveSchema = z.object({
  id: zOptionalUuid,
  version: zVersion.nullable(),
  siteId: zUuid,
  areaId: zUuid,
  personId: zOptionalUuid,
  positionId: zOptionalUuid,
  templateId: zOptionalUuid,
  date: zDate,
  startTime: zTime,
  endTime: zTime,
  breakMinutes: z.number().int().min(0, "La pausa no puede ser negativa.").max(600),
  breakTreatment: z.enum(["remunerada", "no_remunerada", "por_definir"]),
  notes: z.string().trim().max(500, "Máximo 500 caracteres."),
});

export async function saveShift(input: unknown): Promise<Result> {
  const result = await tenantAction({
    permission: "turnos.editar",
    schema: saveSchema,
    input,
    run: async ({ tx, auth, data }) => {
      const zone = await siteZone(tx, auth, data.siteId);
      const [area] = await tx.select().from(areas).where(eq(areas.id, data.areaId));
      if (!area || area.siteId !== data.siteId) throw new UserError("El área no pertenece a la sede seleccionada.");
      if (!area.active) throw new UserError("El área está inactiva.");

      let personName: string | null = null;
      if (data.personId) {
        const [person] = await tx.select().from(people).where(eq(people.id, data.personId));
        if (!person) throw new UserError("La persona seleccionada no existe.");
        if (!person.active) throw new UserError(`${person.fullName} está inactiva y no se puede asignar.`);
        personName = person.fullName;
      }
      if (data.positionId) {
        const [position] = await tx.select({ id: positions.id }).from(positions).where(eq(positions.id, data.positionId));
        if (!position) throw new UserError("El cargo seleccionado no existe.");
      }
      if (data.templateId) {
        const [template] = await tx.select({ id: shiftTemplates.id }).from(shiftTemplates).where(eq(shiftTemplates.id, data.templateId));
        if (!template) throw new UserError("La plantilla seleccionada no existe.");
      }

      const { startsAt, endsAt } = shiftFromTimes(data.date, data.startTime, data.endTime, zone);
      const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
      if (data.breakMinutes >= minutes) throw new UserError("La pausa debe ser menor que la duración del turno.");

      const values = {
        siteId: data.siteId,
        areaId: data.areaId,
        personId: data.personId,
        positionId: data.positionId,
        templateId: data.templateId,
        startsAt,
        endsAt,
        breakMinutes: data.breakMinutes,
        breakTreatment: data.breakMinutes === 0 ? ("por_definir" as const) : data.breakTreatment,
        notes: data.notes || null,
        updatedBy: auth.user.id,
        updatedAt: new Date(),
      };

      if (data.id) {
        const [before] = await tx.select().from(shifts).where(eq(shifts.id, data.id));
        if (!before) throw new UserError("El turno ya no existe.");
        if (!isEditable(before.status)) {
          throw new UserError(`Este turno está ${STATUS_LABELS[before.status].toLowerCase()}. Reábrelo antes de cambiarlo.`);
        }
        if (before.version !== data.version) throw new UserError(STALE);
        const [after] = await tx
          .update(shifts)
          .set({ ...values, version: before.version + 1 })
          .where(and(eq(shifts.id, data.id), eq(shifts.version, before.version)))
          .returning();
        if (!after) throw new UserError(STALE);
        await recordAudit(tx, auth, { action: "turno.editar", entityType: "turno", entityId: after.id, summary: `Se editó el turno: ${describe(after, zone, personName)}.`, before, after });
      } else {
        const [after] = await tx
          .insert(shifts)
          .values({ ...values, orgId: auth.org.id, status: "borrador", createdBy: auth.user.id })
          .returning();
        await recordAudit(tx, auth, { action: "turno.crear", entityType: "turno", entityId: after.id, summary: `Se creó el turno: ${describe(after, zone, personName)}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}

const moveSchema = z.object({
  id: zUuid,
  version: zVersion,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

/** Cambio de horario desde el calendario (arrastrar o redimensionar). */
export async function moveShift(input: unknown): Promise<Result> {
  const result = await tenantAction({
    permission: "turnos.editar",
    schema: moveSchema,
    input,
    run: async ({ tx, auth, data }) => {
      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
      if (minutes < 15 || minutes > 1440) throw new UserError("Un turno debe durar entre 15 minutos y 24 horas.");
      const [before] = await tx.select().from(shifts).where(eq(shifts.id, data.id));
      if (!before) throw new UserError("El turno ya no existe.");
      if (!isEditable(before.status)) {
        throw new UserError(`Este turno está ${STATUS_LABELS[before.status].toLowerCase()}. Reábrelo antes de moverlo.`);
      }
      if (before.breakMinutes >= minutes) throw new UserError("El turno quedaría más corto que su pausa.");
      const [after] = await tx
        .update(shifts)
        .set({ startsAt, endsAt, version: before.version + 1, updatedBy: auth.user.id, updatedAt: new Date() })
        .where(and(eq(shifts.id, data.id), eq(shifts.version, data.version)))
        .returning();
      if (!after) throw new UserError(STALE);
      const zone = await siteZone(tx, auth, after.siteId);
      await recordAudit(tx, auth, { action: "turno.mover", entityType: "turno", entityId: after.id, summary: `Se cambió el horario del turno: ${describe(after, zone, null).replace("vacante, ", "")}.`, before, after });
    },
  });
  if (result.ok) refresh();
  return result;
}

const transitionSchema = z.object({
  id: zUuid,
  version: zVersion,
  key: z.string().max(20),
  reason: z.string().trim().max(500).optional(),
});

export async function transitionShift(input: unknown): Promise<Result> {
  const result = await tenantAction({
    permission: "turnos.ver",
    schema: transitionSchema,
    input,
    run: async ({ tx, auth, data }) => {
      const [before] = await tx.select().from(shifts).where(eq(shifts.id, data.id));
      if (!before) throw new UserError("El turno ya no existe.");
      if (before.version !== data.version) throw new UserError(STALE);
      const check = checkTransition({
        key: data.key,
        status: before.status,
        reason: data.reason,
        hasPermission: auth.can,
        actorId: auth.user.id,
        lastEditorId: before.updatedBy,
        separationOfDuties: auth.org.separationOfDuties,
      });
      if (!check.ok) throw new UserError(check.message);
      const { transition } = check;
      // Una aprobación no cuenta como edición: conserva quién hizo el último cambio de contenido.
      const [after] = await tx
        .update(shifts)
        .set({ status: transition.to, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(shifts.id, data.id), eq(shifts.version, before.version)))
        .returning();
      if (!after) throw new UserError(STALE);
      await recordAudit(tx, auth, {
        action: `turno.${transition.key}`,
        entityType: "turno",
        entityId: after.id,
        summary: `Turno: ${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]}.`,
        before: { status: before.status },
        after: { status: after.status },
        reason: data.reason,
      });
    },
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteShift(input: unknown): Promise<Result> {
  const result = await tenantAction({
    permission: "turnos.editar",
    schema: z.object({ id: zUuid, version: zVersion }),
    input,
    run: async ({ tx, auth, data }) => {
      const [before] = await tx.select().from(shifts).where(eq(shifts.id, data.id));
      if (!before) throw new UserError("El turno ya no existe.");
      if (before.status !== "borrador") throw new UserError("Solo se eliminan borradores. Los demás turnos se cancelan para conservar su historial.");
      if (before.version !== data.version) throw new UserError(STALE);
      const deleted = await tx.delete(shifts).where(and(eq(shifts.id, data.id), eq(shifts.version, data.version))).returning({ id: shifts.id });
      if (deleted.length === 0) throw new UserError(STALE);
      await recordAudit(tx, auth, { action: "turno.eliminar", entityType: "turno", entityId: before.id, summary: "Se eliminó un turno en borrador.", before });
    },
  });
  if (result.ok) refresh();
  return result;
}

const copySchema = z.object({ weekStart: zDate, siteId: zOptionalUuid });

/**
 * Copia los turnos de una semana a la siguiente como borradores, conservando la hora local
 * de cada sede. Los turnos cancelados no se copian. Si la persona ya tiene un turno que se
 * cruza en la semana destino, ese turno se omite y se informa.
 */
export async function copyWeek(input: unknown): Promise<Result> {
  const result = await tenantAction({
    permission: "turnos.editar",
    schema: copySchema,
    input,
    run: async ({ tx, auth, data }) => {
      const orgZone = auth.org.timezone;
      const from = localToInstant(data.weekStart, "00:00", orgZone);
      const to = localToInstant(addDays(data.weekStart, 7), "00:00", orgZone);
      const source = await tx
        .select({ shift: shifts, siteZone: sites.timezone, personActive: people.active })
        .from(shifts)
        .innerJoin(sites, eq(sites.id, shifts.siteId))
        .leftJoin(people, eq(people.id, shifts.personId))
        .where(and(gte(shifts.startsAt, from), lt(shifts.startsAt, to), ne(shifts.status, "cancelado"), data.siteId ? eq(shifts.siteId, data.siteId) : undefined));
      if (source.length === 0) throw new UserError("No hay turnos para copiar en esa semana.");
      if (source.length > 2000) throw new UserError("Son demasiados turnos para copiar de una vez. Filtra por sede.");

      let copied = 0;
      let skipped = 0;
      let unassigned = 0;
      for (const { shift, siteZone: zoneOrNull, personActive } of source) {
        const zone = zoneOrNull ?? orgZone;
        const local = instantToLocal(shift.startsAt, zone);
        const startsAt = localToInstant(addDays(local.date, 7), local.time, zone);
        const endsAt = new Date(startsAt.getTime() + (shift.endsAt.getTime() - shift.startsAt.getTime()));
        // Una persona inactiva no se arrastra a la nueva semana: el turno queda vacante.
        const personId = shift.personId && personActive ? shift.personId : null;
        if (shift.personId && !personId) unassigned++;
        try {
          await tx.transaction(async (sp) => {
            await sp.insert(shifts).values({
              orgId: auth.org.id,
              siteId: shift.siteId,
              areaId: shift.areaId,
              personId,
              positionId: shift.positionId,
              templateId: shift.templateId,
              startsAt,
              endsAt,
              breakMinutes: shift.breakMinutes,
              breakTreatment: shift.breakTreatment,
              notes: shift.notes,
              status: "borrador",
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
            });
          });
          copied++;
        } catch (error) {
          const text = String((error as { cause?: { constraint_name?: string } })?.cause?.constraint_name ?? (error as { constraint_name?: string })?.constraint_name ?? "");
          if (text !== "shifts_person_no_overlap") throw error;
          skipped++;
        }
      }
      await recordAudit(tx, auth, {
        action: "turno.copiar_semana",
        entityType: "turno",
        summary: `Se copió la semana del ${data.weekStart} a la siguiente: ${copied} turnos creados, ${skipped} omitidos por cruce.`,
        after: { weekStart: data.weekStart, siteId: data.siteId, copied, skipped, unassigned },
      });
      const parts = [copied === 1 ? "1 turno copiado como borrador" : `${copied} turnos copiados como borrador`];
      if (skipped) parts.push(`${skipped} omitidos porque la persona ya tenía un turno en ese horario`);
      if (unassigned) parts.push(`${unassigned} quedaron vacantes porque la persona está inactiva`);
      return `${parts.join("; ")}.`;
    },
  });
  if (result.ok) refresh();
  return result;
}

export type ShiftHistoryItem = { id: string; at: string; actorName: string; summary: string; reason: string | null };

export async function getShiftHistory(shiftId: string): Promise<ShiftHistoryItem[]> {
  const auth = await getAuth();
  if (!auth || !auth.can("turnos.ver") || !z.uuid().safeParse(shiftId).success) return [];
  const events = await withTenant(auth.org.id, (tx) => listAudit(tx, { limit: 30, entityType: "turno", entityId: shiftId }));
  return events.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), actorName: e.actorName, summary: e.summary, reason: e.reason }));
}
