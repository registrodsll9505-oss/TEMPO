import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { memberships, organizations, users, type Role } from "@/db/schema";
import { can, type Permission } from "@/lib/permissions";
import { readSession } from "./session";

export type AuthContext = {
  sessionId: string;
  user: { id: string; name: string; email: string; mustChangePassword: boolean };
  org: {
    id: string;
    tradeName: string;
    legalName: string;
    timezone: string;
    currency: string;
    separationOfDuties: boolean;
    isDemo: boolean;
  };
  role: Role;
  /** Empresas a las que pertenece el usuario. */
  orgs: { id: string; tradeName: string; role: Role }[];
  can: (permission: Permission) => boolean;
};

/**
 * Resuelve quién hace la petición y en nombre de qué empresa. La empresa activa siempre se
 * deriva de una membresía vigente del usuario: nunca se toma de la URL ni del formulario.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession();
  if (!session) return null;

  const [user] = await systemDb.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.disabledAt) return null;

  const rows = await systemDb
    .select({ role: memberships.role, org: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.active, true)))
    .orderBy(organizations.tradeName);
  if (rows.length === 0) return null;

  const active = rows.find((r) => r.org.id === session.activeOrgId) ?? rows[0];
  const role = active.role;

  return {
    sessionId: session.id,
    user: { id: user.id, name: user.name, email: user.email, mustChangePassword: user.mustChangePassword },
    org: {
      id: active.org.id,
      tradeName: active.org.tradeName,
      legalName: active.org.legalName,
      timezone: active.org.timezone,
      currency: active.org.currency,
      separationOfDuties: active.org.separationOfDuties,
      isDemo: active.org.isDemo,
    },
    role,
    orgs: rows.map((r) => ({ id: r.org.id, tradeName: r.org.tradeName, role: r.role })),
    can: (permission) => can(role, permission),
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/ingresar");
  return auth;
}

/** Para páginas: exige el permiso o redirige al inicio. */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!auth.can(permission)) redirect("/inicio?sin_permiso=1");
  return auth;
}
