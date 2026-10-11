"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { shiftTemplates } from "@/db/schema";
import { formToObject, tenantAction, UserError, zCheckbox, zOptionalUuid, zText, type ActionState } from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import { isTime } from "@/lib/time";

const zTime = z.string().refine(isTime, "Hora inválida. Usa el formato 24 horas, por ejemplo 22:00.");

const templateSchema = z
  .object({
    id: zOptionalUuid,
    name: zText(80),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,9}$/, "Usa hasta 10 letras, números o guiones."),
    startTime: zTime,
    endTime: zTime,
    breakMinutes: z.coerce.number("Escribe los minutos de pausa.").int("Usa minutos enteros.").min(0, "No puede ser negativo.").max(600),
    breakTreatment: z.enum(["remunerada", "no_remunerada", "por_definir"]),
    areaId: zOptionalUuid,
    positionId: zOptionalUuid,
    active: zCheckbox,
  })
  .transform((v) => {
    const [sh, sm] = v.startTime.split(":").map(Number);
    const [eh, em] = v.endTime.split(":").map(Number);
    let duration = eh * 60 + em - (sh * 60 + sm);
    // Fin menor o igual al inicio: el turno termina al día siguiente.
    if (duration <= 0) duration += 1440;
    return { ...v, durationMinutes: duration };
  })
  .refine((v) => v.breakMinutes < v.durationMinutes, { path: ["breakMinutes"], message: "La pausa debe ser menor que la duración del turno." });

export async function saveTemplate(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "plantillas.editar",
    schema: templateSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const values = {
        name: data.name,
        code: data.code,
        startTime: data.startTime.slice(0, 5),
        durationMinutes: data.durationMinutes,
        breakMinutes: data.breakMinutes,
        breakTreatment: data.breakMinutes === 0 ? ("por_definir" as const) : data.breakTreatment,
        areaId: data.areaId,
        positionId: data.positionId,
      };
      if (data.id) {
        const [before] = await tx.select().from(shiftTemplates).where(eq(shiftTemplates.id, data.id));
        if (!before) throw new UserError("La plantilla ya no existe.");
        const [after] = await tx.update(shiftTemplates).set({ ...values, active: data.active }).where(eq(shiftTemplates.id, data.id)).returning();
        await recordAudit(tx, auth, { action: "plantilla.editar", entityType: "plantilla", entityId: data.id, summary: `Se editó la plantilla ${after.name}.`, before, after });
      } else {
        const [after] = await tx.insert(shiftTemplates).values({ ...values, active: true, orgId: auth.org.id }).returning();
        await recordAudit(tx, auth, { action: "plantilla.crear", entityType: "plantilla", entityId: after.id, summary: `Se creó la plantilla ${after.name}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}
