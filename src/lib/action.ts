import "server-only";
import { z } from "zod";
import { withTenant, type TenantTx } from "@/db/client";
import { getAuth, type AuthContext } from "@/lib/auth/context";
import type { Permission } from "@/lib/permissions";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/** Error con un mensaje pensado para mostrarse al usuario. */
export class UserError extends Error {}

function pgCode(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint_name === "string" ? candidate.constraint_name : undefined,
      };
    }
    current = candidate.cause;
  }
  return {};
}

function describeDbError(error: unknown): string | null {
  const { code, constraint } = pgCode(error);
  if (code === "23P01" && constraint === "shifts_person_no_overlap") {
    return "Esa persona ya tiene otro turno que se cruza con este horario.";
  }
  if (code === "23505") return "Ya existe un registro con ese código o nombre.";
  if (code === "23503") return "El registro está relacionado con otros datos y no se puede cambiar así.";
  if (code === "23514") return "Los datos no cumplen una regla de integridad. Revisa horas, duración y pausas.";
  if (code === "42501") return "La operación no está permitida.";
  return null;
}

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  }
  return out;
}

/**
 * Envoltura común de las acciones de servidor sobre datos de una empresa:
 * vuelve a comprobar sesión y permiso, valida la entrada y ejecuta en una transacción
 * aislada por empresa. Los errores inesperados no se muestran al usuario con detalle.
 */
export async function tenantAction<S extends z.ZodType>(options: {
  permission: Permission;
  schema: S;
  input: unknown;
  run: (ctx: { tx: TenantTx; auth: AuthContext; data: z.infer<S> }) => Promise<string | void>;
}): Promise<NonNullable<ActionState>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, message: "Tu sesión terminó. Vuelve a ingresar." };
  if (!auth.can(options.permission)) return { ok: false, message: "Tu rol no permite esta acción." };

  const parsed = options.schema.safeParse(options.input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors };
  }

  try {
    const message = await withTenant(auth.org.id, (tx) => options.run({ tx, auth, data: parsed.data }));
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, message: error.message };
    const known = describeDbError(error);
    if (known) return { ok: false, message: known };
    console.error("[tempo] error en acción", error);
    return { ok: false, message: "No se pudo guardar por un error interno. Inténtalo de nuevo." };
  }
}

// --- Piezas de validación reutilizables -----------------------------------------------

export const zText = (max = 120) => z.string().trim().min(1, "Este campo es obligatorio.").max(max, `Máximo ${max} caracteres.`);
export const zOptionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);
export const zUuid = z.uuid("Selección inválida.");
export const zOptionalUuid = z
  .union([z.uuid("Selección inválida."), z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));
export const zCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");
