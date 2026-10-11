import "server-only";
import type { TenantTx } from "@/db/client";
import { auditEvents } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/context";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/** Registra un evento de auditoría dentro de la misma transacción del cambio. */
export async function recordAudit(tx: TenantTx, auth: AuthContext, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    orgId: auth.org.id,
    actorUserId: auth.user.id,
    actorName: auth.user.name,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason?.trim() || null,
  });
}
