"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { people } from "@/db/schema";
import {
  formToObject,
  tenantAction,
  UserError,
  zCheckbox,
  zOptionalText,
  zOptionalUuid,
  zText,
  type ActionState,
} from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import { isIsoDate } from "@/lib/time";

const zOptionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isIsoDate(v), "Fecha inválida.");

const personSchema = z
  .object({
    id: zOptionalUuid,
    internalCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "Usa hasta 20 letras, números o guiones."),
    fullName: zText(160),
    employmentType: z.enum(["empleado_directo", "contratista"], "Elige el tipo de vinculación."),
    providerName: zOptionalText(160),
    siteId: zOptionalUuid,
    areaId: zOptionalUuid,
    positionId: zOptionalUuid,
    contractType: zOptionalText(80),
    agreedWeeklyHours: z
      .string()
      .optional()
      .transform((v) => (v ? v.replace(",", ".") : null))
      .refine((v) => v === null || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 168), "Escribe las horas por semana, por ejemplo 42."),
    startDate: zOptionalDate,
    endDate: zOptionalDate,
    notes: zOptionalText(1000),
    active: zCheckbox,
  })
  .refine((v) => v.employmentType !== "contratista" || v.providerName, {
    path: ["providerName"],
    message: "Indica la empresa contratista.",
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "La fecha de finalización no puede ser anterior al ingreso.",
  });

export async function savePerson(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "personal.editar",
    schema: personSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const { id, active, ...rest } = data;
      const base = {
        internalCode: rest.internalCode,
        fullName: rest.fullName,
        employmentType: rest.employmentType,
        providerName: rest.employmentType === "contratista" ? rest.providerName : null,
        siteId: rest.siteId,
        areaId: rest.areaId,
        positionId: rest.positionId,
      };
      // Los datos contractuales solo los cambia quien puede verlos.
      const contract = auth.can("personal.ver_contrato")
        ? {
            contractType: rest.contractType,
            agreedWeeklyHours: rest.agreedWeeklyHours,
            startDate: rest.startDate,
            endDate: rest.endDate,
            notes: rest.notes,
          }
        : {};
      if (id) {
        const [before] = await tx.select().from(people).where(eq(people.id, id));
        if (!before) throw new UserError("La persona ya no existe.");
        const [after] = await tx
          .update(people)
          .set({ ...base, ...contract, active, updatedAt: new Date() })
          .where(eq(people.id, id))
          .returning();
        await recordAudit(tx, auth, { action: "persona.editar", entityType: "persona", entityId: id, summary: `Se editó a ${after.fullName}.`, before, after });
      } else {
        const [after] = await tx
          .insert(people)
          .values({ ...base, ...contract, active: true, orgId: auth.org.id })
          .returning();
        await recordAudit(tx, auth, { action: "persona.crear", entityType: "persona", entityId: after.id, summary: `Se registró a ${after.fullName}.`, after });
      }
    },
  });
  if (result.ok) refresh();
  return result;
}
