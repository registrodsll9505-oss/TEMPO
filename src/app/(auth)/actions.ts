"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/db/client";
import { auditEvents, memberships, organizations, users } from "@/db/schema";
import { formToObject, type ActionState } from "@/lib/action";
import { getAuth } from "@/lib/auth/context";
import { dummyPasswordHash, hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  isLoginBlocked,
  recordLoginAttempt,
  setActiveOrg,
} from "@/lib/auth/session";

const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribe un correo válido.").max(200));
const zPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(200, "Máximo 200 caracteres.");

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[String(issue.path[0] ?? "_")] ??= []).push(issue.message);
  return out;
}

const loginSchema = z.object({ email: zEmail, password: z.string().min(1, "Escribe tu contraseña.").max(200) });

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, message: "Revisa los campos.", fieldErrors: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;

  if (await isLoginBlocked(email)) {
    return { ok: false, message: "Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentarlo." };
  }

  const [user] = await systemDb.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !valid || user.disabledAt) {
    await recordLoginAttempt(email, false);
    return { ok: false, message: "Correo o contraseña incorrectos." };
  }

  const [membership] = await systemDb
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.active, true)))
    .limit(1);
  if (!membership) {
    await recordLoginAttempt(email, false);
    return { ok: false, message: "Tu usuario no tiene acceso activo a ninguna empresa. Habla con tu administrador." };
  }

  await recordLoginAttempt(email, true);
  await createSession(user.id, membership.orgId);
  redirect(user.mustChangePassword ? "/cuenta" : "/inicio");
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre.").max(120),
  email: zEmail,
  password: zPassword,
  tradeName: z.string().trim().min(2, "Escribe el nombre de la empresa.").max(120),
});

export async function register(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, message: "Revisa los campos.", fieldErrors: fieldErrors(parsed.error) };
  const { name, email, password, tradeName } = parsed.data;

  const [existing] = await systemDb.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { ok: false, message: "Ya existe una cuenta con ese correo. Ingresa con ella.", fieldErrors: { email: ["Correo ya registrado."] } };
  }

  const passwordHash = await hashPassword(password);
  const created = await systemDb.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ name, email, passwordHash }).returning({ id: users.id });
    const [org] = await tx
      .insert(organizations)
      .values({ tradeName, legalName: tradeName })
      .returning({ id: organizations.id });
    await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: "admin_empresa" });
    await tx.insert(auditEvents).values({
      orgId: org.id,
      actorUserId: user.id,
      actorName: name,
      action: "empresa.crear",
      entityType: "empresa",
      entityId: org.id,
      summary: `Se creó la empresa ${tradeName}.`,
      after: { tradeName },
    });
    return { userId: user.id, orgId: org.id };
  });

  await createSession(created.userId, created.orgId);
  redirect("/inicio");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/ingresar");
}

export async function switchOrg(form: FormData): Promise<void> {
  const auth = await getAuth();
  const orgId = String(form.get("orgId") ?? "");
  if (!auth) redirect("/ingresar");
  // Solo se puede cambiar a una empresa en la que el usuario tiene membresía activa.
  if (auth.orgs.some((o) => o.id === orgId)) {
    await setActiveOrg(auth.sessionId, orgId);
  }
  redirect("/inicio");
}

const passwordSchema = z
  .object({ current: z.string().min(1, "Escribe tu contraseña actual."), next: zPassword, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden." })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "La nueva contraseña debe ser distinta." });

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, message: "Tu sesión terminó. Vuelve a ingresar." };
  const parsed = passwordSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, message: "Revisa los campos.", fieldErrors: fieldErrors(parsed.error) };

  const [user] = await systemDb.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { ok: false, message: "La contraseña actual no es correcta.", fieldErrors: { current: ["No coincide."] } };
  }
  await systemDb
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false })
    .where(eq(users.id, user.id));
  await destroyOtherSessions(user.id, auth.sessionId);
  refresh();
  return { ok: true, message: "Contraseña actualizada. Se cerraron tus otras sesiones." };
}
