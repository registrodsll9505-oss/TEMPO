import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { loginAttempts, sessions } from "@/db/schema";

const COOKIE_NAME = "tempo_sesion";
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, activeOrgId: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_LIFETIME_MS);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await systemDb.insert(sessions).values({ tokenHash: hashToken(token), userId, activeOrgId, userAgent, expiresAt });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionRecord = { id: string; userId: string; activeOrgId: string | null };

/** Devuelve la sesión vigente o null. No modifica cookies, así que sirve en Server Components. */
export async function readSession(): Promise<SessionRecord | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const now = new Date();
  const [row] = await systemDb
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > IDLE_LIFETIME_MS) {
    await systemDb.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await systemDb.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  }
  return { id: row.id, userId: row.userId, activeOrgId: row.activeOrgId };
}

export async function setActiveOrg(sessionId: string, orgId: string): Promise<void> {
  await systemDb.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, sessionId));
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await systemDb.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(COOKIE_NAME);
}

export async function destroyOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await systemDb
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), sql`${sessions.id} <> ${keepSessionId}`));
}

// --- Límite de intentos de inicio de sesión -------------------------------------------

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;

export async function isLoginBlocked(email: string): Promise<boolean> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const [row] = await systemDb
    .select({ failed: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  return (row?.failed ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(email: string, succeeded: boolean): Promise<void> {
  await systemDb.insert(loginAttempts).values({ email, succeeded });
  if (succeeded) {
    // Un ingreso correcto limpia los fallos anteriores de ese correo.
    await systemDb.delete(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false)));
  } else {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await systemDb.delete(loginAttempts).where(lt(loginAttempts.createdAt, old));
  }
}
