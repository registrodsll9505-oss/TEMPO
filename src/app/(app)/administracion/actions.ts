"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/db/client";
import { memberships, organizations, sessions, users } from "@/db/schema";
import { formToObject, tenantAction, UserError, zCheckbox, zOptionalText, zText, zUuid, type ActionState } from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { isValidZone } from "@/lib/time";

const orgSchema = z.object({
  tradeName: zText(),
  legalName: zText(160),
  taxId: zOptionalText(30),
  timezone: z.string().trim().refine(isValidZone, "Zona horaria no reconocida. Ejemplo: America/Bogota."),
  separationOfDuties: zCheckbox,
});

export async function saveOrganization(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "empresa.administrar",
    schema: orgSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const [before] = await tx.select().from(organizations).where(eq(organizations.id, auth.org.id));
      const [after] = await tx
        .update(organizations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organizations.id, auth.org.id))
        .returning();
      await recordAudit(tx, auth, { action: "empresa.editar", entityType: "empresa", entityId: auth.org.id, summary: "Se actualizaron los datos de la empresa.", before, after });
    },
  });
  if (result.ok) refresh();
  return result;
}

const zRole = z.enum(ASSIGNABLE_ROLES as [string, ...string[]], "Elige un rol.");
const zTempPassword = z.string().min(PASSWORD_MIN_LENGTH, `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`).max(200);

const inviteSchema = z.object({
  name: zText(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido.").max(200)),
  role: zRole,
  password: zTempPassword,
});

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "usuarios.administrar",
    schema: inviteSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const role = data.role as (typeof ASSIGNABLE_ROLES)[number];
      // La tabla de usuarios es global: se consulta y escribe con la conexión de sistema.
      const [existing] = await systemDb.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, data.email)).limit(1);
      let userId = existing?.id;
      let created = false;
      if (!userId) {
        const [user] = await systemDb
          .insert(users)
          .values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password), mustChangePassword: true })
          .returning({ id: users.id });
        userId = user.id;
        created = true;
      }
      const [already] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
      if (already) throw new UserError("Esa persona ya es usuaria de esta empresa.");
      await tx.insert(memberships).values({ orgId: auth.org.id, userId, role });
      await recordAudit(tx, auth, {
        action: "usuario.agregar",
        entityType: "usuario",
        entityId: userId,
        summary: `Se agregó a ${created ? data.name : existing!.name} como ${ROLE_LABELS[role]}.`,
        after: { email: data.email, role },
      });
      return created
        ? "Usuario creado. Entrégale la contraseña temporal por un canal seguro; deberá cambiarla al ingresar."
        : "Ese correo ya tenía cuenta en TEMPO. Se agregó a esta empresa y conserva su contraseña.";
    },
  });
  if (result.ok) refresh();
  return result;
}

const memberSchema = z.object({ membershipId: zUuid, role: zRole, active: zCheckbox });

export async function updateMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "usuarios.administrar",
    schema: memberSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const role = data.role as (typeof ASSIGNABLE_ROLES)[number];
      const [before] = await tx.select().from(memberships).where(eq(memberships.id, data.membershipId));
      if (!before) throw new UserError("El usuario ya no pertenece a la empresa.");
      if (before.userId === auth.user.id) throw new UserError("No puedes cambiar tu propio rol ni desactivarte. Pídeselo a otro administrador.");
      const losesAdmin = before.role === "admin_empresa" && before.active && (role !== "admin_empresa" || !data.active);
      if (losesAdmin) {
        const [{ admins }] = await tx
          .select({ admins: sql<number>`count(*)::int` })
          .from(memberships)
          .where(and(eq(memberships.role, "admin_empresa"), eq(memberships.active, true)));
        if (admins <= 1) throw new UserError("La empresa debe conservar al menos un administrador activo.");
      }
      const [after] = await tx.update(memberships).set({ role, active: data.active }).where(eq(memberships.id, before.id)).returning();
      await recordAudit(tx, auth, { action: "usuario.editar", entityType: "usuario", entityId: before.userId, summary: `Se cambió el acceso de un usuario a ${ROLE_LABELS[role]}${data.active ? "" : " (inactivo)"}.`, before, after });
      if (!data.active) {
        // Cierra las sesiones que el usuario tenga abiertas en esta empresa.
        await systemDb.delete(sessions).where(and(eq(sessions.userId, before.userId), eq(sessions.activeOrgId, auth.org.id)));
      }
    },
  });
  if (result.ok) refresh();
  return result;
}

const resetSchema = z.object({ membershipId: zUuid, password: zTempPassword });

export async function resetMemberPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await tenantAction({
    permission: "usuarios.administrar",
    schema: resetSchema,
    input: formToObject(form),
    run: async ({ tx, auth, data }) => {
      const [member] = await tx.select().from(memberships).where(eq(memberships.id, data.membershipId));
      if (!member) throw new UserError("El usuario ya no pertenece a la empresa.");
      if (member.userId === auth.user.id) throw new UserError("Para tu propia contraseña usa Mi cuenta.");
      // Un administrador no puede tomar control de una cuenta que también pertenece a otra empresa.
      const [{ total }] = await systemDb
        .select({ total: sql<number>`count(*)::int` })
        .from(memberships)
        .where(eq(memberships.userId, member.userId));
      if (total > 1) {
        throw new UserError("Este usuario pertenece a más de una empresa. Solo él puede cambiar su contraseña.");
      }
      await systemDb
        .update(users)
        .set({ passwordHash: await hashPassword(data.password), mustChangePassword: true })
        .where(eq(users.id, member.userId));
      await systemDb.delete(sessions).where(eq(sessions.userId, member.userId));
      await recordAudit(tx, auth, { action: "usuario.restablecer_clave", entityType: "usuario", entityId: member.userId, summary: "Se restableció la contraseña de un usuario." });
      return "Contraseña temporal asignada. Deberá cambiarla al ingresar.";
    },
  });
  if (result.ok) refresh();
  return result;
}
