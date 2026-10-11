import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { Check, ChevronRight, CircleAlert } from "lucide-react";
import { withTenant } from "@/db/client";
import { shifts } from "@/db/schema";
import { PageHeader, Section } from "@/components/ui";
import { requireAuth } from "@/lib/auth/context";
import { areaColor } from "@/lib/colors";
import { countRows, listAudit, listShiftsInRange } from "@/lib/queries";
import { addDays, capitalize, localToInstant, startOfWeek, todayIn, toZoned } from "@/lib/time";

export const metadata: Metadata = { title: "Inicio" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const auth = await requireAuth();
  const params = await searchParams;
  const zone = auth.org.timezone;
  const today = todayIn(zone);
  const dayStart = localToInstant(today, "00:00", zone);
  const dayEnd = localToInstant(addDays(today, 1), "00:00", zone);
  const weekStart = localToInstant(startOfWeek(today), "00:00", zone);
  const weekEnd = localToInstant(addDays(startOfWeek(today), 7), "00:00", zone);
  const horizon = localToInstant(addDays(today, 7), "00:00", zone);
  const canShifts = auth.can("turnos.ver");

  const data = await withTenant(auth.org.id, async (tx) => {
    const counts = await countRows(tx);
    const n = sql<number>`count(*)::int`;
    const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const active = ne(shifts.status, "cancelado");
    return {
      counts,
      todayCount: canShifts ? await one(tx.select({ n }).from(shifts).where(and(gte(shifts.startsAt, dayStart), lt(shifts.startsAt, dayEnd), active))) : 0,
      vacant: canShifts ? await one(tx.select({ n }).from(shifts).where(and(gte(shifts.startsAt, dayStart), lt(shifts.startsAt, horizon), isNull(shifts.personId), active))) : 0,
      pending: canShifts ? await one(tx.select({ n }).from(shifts).where(eq(shifts.status, "pendiente_aprobacion"))) : 0,
      weekMinutes: canShifts
        ? ((
            await tx
              .select({ m: sql<number>`coalesce(sum(extract(epoch from (${shifts.endsAt} - ${shifts.startsAt})) / 60), 0)::int` })
              .from(shifts)
              .where(and(gte(shifts.startsAt, weekStart), lt(shifts.startsAt, weekEnd), active))
          )[0]?.m ?? 0)
        : 0,
      todayShifts: canShifts ? (await listShiftsInRange(tx, { from: dayStart, to: dayEnd }, null)).filter((s) => s.status !== "cancelado" && new Date(s.startsAt) >= dayStart) : [],
      recent: auth.can("auditoria.ver") ? await listAudit(tx, { limit: 8 }) : [],
    };
  });

  const steps = [
    { done: data.counts.sites > 0, label: "Crea tu primera sede", href: "/estructura", show: auth.can("estructura.editar") },
    { done: data.counts.areas > 0, label: "Define las áreas de trabajo", href: "/estructura", show: auth.can("estructura.editar") },
    { done: data.counts.positions > 0, label: "Registra los cargos", href: "/estructura", show: auth.can("estructura.editar") },
    { done: data.counts.people > 0, label: "Registra a las personas", href: "/personal", show: auth.can("personal.editar") },
    { done: data.counts.templates > 0, label: "Crea plantillas de turno", href: "/turnos", show: auth.can("plantillas.editar") },
    { done: data.counts.shifts > 0, label: "Programa el primer turno en el calendario", href: "/calendario", show: auth.can("turnos.editar") },
  ].filter((s) => s.show);
  const setupPending = steps.some((s) => !s.done);

  const weekHours = Math.round((data.weekMinutes / 60) * 10) / 10;
  const figures = [
    { label: "Turnos que inician hoy", value: data.todayCount, href: `/calendario?vista=dia&fecha=${today}`, show: canShifts },
    { label: "Sin asignar en los próximos 7 días", value: data.vacant, href: `/calendario?vista=lista&fecha=${today}`, show: canShifts, alert: data.vacant > 0 },
    { label: "Pendientes de aprobación", value: data.pending, href: `/calendario?vista=lista&fecha=${today}`, show: canShifts, alert: data.pending > 0 },
    { label: "Horas programadas esta semana", value: `${String(weekHours).replace(".", ",")} h`, href: `/calendario?vista=equipo&fecha=${today}`, show: canShifts, note: "Duración de los turnos, sin descontar pausas." },
    { label: "Personas activas", value: data.counts.people, href: "/personal", show: auth.can("personal.ver") },
  ].filter((f) => f.show);

  return (
    <>
      <PageHeader title={`Hola, ${auth.user.name.split(" ")[0]}`} description={capitalize(toZoned(new Date(), zone).toFormat("cccc d 'de' LLLL 'de' yyyy"))} />

      {params.sin_permiso ? (
        <p role="alert" className="mx-5 mt-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] px-3 py-2 text-warn md:mx-8">
          <CircleAlert size={16} aria-hidden /> Tu rol no tiene acceso a esa sección.
        </p>
      ) : null}

      {auth.role === "empleado" ? (
        <Section title="Portal del empleado">
          <p className="max-w-[60ch] text-ink-2">El portal para consultar tus turnos aún no está disponible. Tu coordinador te compartirá la programación mientras tanto.</p>
        </Section>
      ) : null}

      {setupPending ? (
        <Section title="Primeros pasos">
          <ol className="max-w-xl overflow-hidden rounded-xl border border-line">
            {steps.map((step, index) => (
              <li key={step.label} className={index > 0 ? "border-t border-line" : ""}>
                <Link href={step.href} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-fill">
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full ${step.done ? "bg-[var(--ok)] text-white" : "border border-line-strong"}`}>
                    {step.done ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                  </span>
                  <span className={step.done ? "text-ink-2 line-through" : "font-medium"}>{step.label}</span>
                  <span className="sr-only">{step.done ? "(hecho)" : "(pendiente)"}</span>
                  {step.done ? null : <ChevronRight size={15} aria-hidden className="ml-auto text-ink-3" />}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {figures.length > 0 ? (
        <Section title="Resumen">
          <ul className="grid overflow-hidden rounded-xl border border-line sm:grid-cols-2 xl:grid-cols-5">
            {figures.map((figure) => (
              <li key={figure.label} className="-mt-px -ml-px border-t border-l border-line">
                <Link href={figure.href} className="flex h-full flex-col gap-1 px-4 py-3.5 hover:bg-fill">
                  <span className={`tnum text-[28px] leading-none font-semibold ${figure.alert ? "text-warn" : ""}`}>{figure.value}</span>
                  <span className="text-[13px] text-ink-2">{figure.label}</span>
                  {figure.note ? <span className="text-xs text-ink-3">{figure.note}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {canShifts ? (
        <Section
          title="Hoy"
          actions={
            <Link href={`/calendario?vista=dia&fecha=${today}`} className="text-[13px] font-medium underline underline-offset-2">
              Abrir en el calendario
            </Link>
          }
        >
          {data.todayShifts.length === 0 ? (
            <p className="text-ink-2">No hay turnos que inicien hoy.</p>
          ) : (
            <ul className="max-w-3xl overflow-hidden rounded-xl border border-line">
              {data.todayShifts.map((shift, index) => (
                <li key={shift.id} className={`flex items-center gap-3 px-3.5 py-2 ${index > 0 ? "border-t border-line" : ""}`}>
                  <span aria-hidden className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: areaColor(shift.areaColor).solid }} />
                  <span className="tnum w-[104px] shrink-0 font-medium">
                    {toZoned(shift.startsAt, zone).toFormat("HH:mm")}–{toZoned(shift.endsAt, zone).toFormat("HH:mm")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{shift.personName ?? <span className="font-medium text-warn">Vacante</span>}</span>
                  <span className="hidden truncate text-ink-2 sm:block">{shift.areaName}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.recent.length > 0 ? (
        <Section
          title="Cambios recientes"
          actions={
            <Link href="/auditoria" className="text-[13px] font-medium underline underline-offset-2">
              Ver toda la auditoría
            </Link>
          }
        >
          <ul className="max-w-3xl">
            {data.recent.map((event) => (
              <li key={event.id} className="flex gap-3 border-b border-line py-2 last:border-0">
                <span className="tnum w-[92px] shrink-0 text-[13px] text-ink-2">{toZoned(event.createdAt, zone).toFormat("d LLL, HH:mm")}</span>
                <span className="min-w-0">
                  {event.summary} <span className="text-ink-2">{event.actorName}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
