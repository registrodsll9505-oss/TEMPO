"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { areas, positions, sites } from "@/db/schema";
import {
  formToObject,
  tenantAction,
  UserError,
  zCheckbox,
  zOptionalText,
  zOptionalUuid,
  zText,
  zUuid,
  type ActionState,
} from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import { AREA_COLOR_KEYS } from "@/lib/colors";
import { isValidZone } from "@/lib/time";

const zCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "Usa hasta 20 letras, números o guiones.");

const siteSchema = z.object({
  id: zOptionalUuid,
  name: zText(),
  code: zCode,
  address: zOptionalText(200),
  timezone: zOptionalText(60).refine((v) => v === null || isValidZone(v), "Zona horaria no reconocida. Ejemplo: America/Bogota."),
  active: zCheckbox,
});

export async function saveSite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "estructura.editar",
    schema: siteSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const { id, ...values } = data;
      if (id) {
        const [before] = await tx.select().from(sites).where(eq(sites.id, id));
        if (!before) throw new UserError("La sede ya no existe.");
        const [after] = await tx.update(sites).set(values).where(eq(sites.id, id)).returning();
        await recordAudit(tx, auth, { action: "sede.editar", entityType: "sede", entityId: id, summary: `Se editó la sede ${after.name}.`, before, after });
      } else {
        const [after] = await tx.insert(sites).values({ ...values, active: true, orgId: auth.org.id }).returning();
        await recordAudit(tx, auth, { action: "sede.crear", entityType: "sede", entityId: after.id, summary: `Se creó la sede ${after.name}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}

const areaSchema = z.object({
  id: zOptionalUuid,
  siteId: zUuid,
  name: zText(),
  color: z.enum(AREA_COLOR_KEYS as [string, ...string[]], "Elige un color."),
  costCenter: zOptionalText(60),
  active: zCheckbox,
});

export async function saveArea(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "estructura.editar",
    schema: areaSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const { id, ...values } = data;
      const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, values.siteId));
      if (!site) throw new UserError("La sede seleccionada no existe.");
      if (id) {
        const [before] = await tx.select().from(areas).where(eq(areas.id, id));
        if (!before) throw new UserError("El área ya no existe.");
        const [after] = await tx.update(areas).set(values).where(eq(areas.id, id)).returning();
        await recordAudit(tx, auth, { action: "area.editar", entityType: "area", entityId: id, summary: `Se editó el área ${after.name}.`, before, after });
      } else {
        const [after] = await tx.insert(areas).values({ ...values, active: true, orgId: auth.org.id }).returning();
        await recordAudit(tx, auth, { action: "area.crear", entityType: "area", entityId: after.id, summary: `Se creó el área ${after.name}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}

const positionSchema = z.object({
  id: zOptionalUuid,
  name: zText(),
  description: zOptionalText(300),
  active: zCheckbox,
});

export async function savePosition(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "estructura.editar",
    schema: positionSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const { id, ...values } = data;
      if (id) {
        const [before] = await tx.select().from(positions).where(eq(positions.id, id));
        if (!before) throw new UserError("El cargo ya no existe.");
        const [after] = await tx.update(positions).set(values).where(eq(positions.id, id)).returning();
        await recordAudit(tx, auth, { action: "cargo.editar", entityType: "cargo", entityId: id, summary: `Se editó el cargo ${after.name}.`, before, after });
      } else {
        const [after] = await tx.insert(positions).values({ ...values, active: true, orgId: auth.org.id }).returning();
        await recordAudit(tx, auth, { action: "cargo.crear", entityType: "cargo", entityId: after.id, summary: `Se creó el cargo ${after.name}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}
