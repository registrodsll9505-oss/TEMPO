import type { Metadata } from "next";
import { withTenant } from "@/db/client";
import { CalendarApp } from "@/components/calendar/calendar-app";
import type { CalendarData } from "@/components/calendar/types";
import { requirePermission } from "@/lib/auth/context";
import { listAreas, listPeople, listPositions, listShiftsInRange, listSites, listTemplates } from "@/lib/queries";
import { CALENDAR_VIEWS, isIsoDate, rangeForView, todayIn, type CalendarView } from "@/lib/time";

export const metadata: Metadata = { title: "Calendario" };

type Params = { vista?: string; fecha?: string; sede?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const auth = await requirePermission("turnos.ver");
  const params = await searchParams;
  const view: CalendarView = CALENDAR_VIEWS.includes(params.vista as CalendarView) ? (params.vista as CalendarView) : "semana";

  const data = await withTenant(auth.org.id, async (tx) => {
    const sites = (await listSites(tx)).filter((s) => s.active);
    // La sede se valida contra las de la empresa; un identificador ajeno simplemente se ignora.
    const site = sites.find((s) => s.id === params.sede) ?? null;
    const zone = site?.timezone ?? auth.org.timezone;
    const today = todayIn(zone);
    const anchor = isIsoDate(params.fecha) ? params.fecha : today;
    const range = rangeForView(view, anchor, zone);
    return {
      sites,
      site,
      zone,
      today,
      anchor,
      areas: (await listAreas(tx)).filter((a) => a.active),
      people: (await listPeople(tx)).filter((p) => p.active),
      positions: (await listPositions(tx)).filter((p) => p.active),
      templates: (await listTemplates(tx)).filter((t) => t.active),
      shifts: await listShiftsInRange(tx, range, site?.id ?? null),
    };
  });

  const calendar: CalendarData = {
    view,
    anchor: data.anchor,
    today: data.today,
    zone: data.zone,
    siteId: data.site?.id ?? null,
    sites: data.sites.map((s) => ({ id: s.id, name: s.name, zone: s.timezone ?? auth.org.timezone })),
    areas: data.areas.map((a) => ({ id: a.id, name: a.name, color: a.color, siteId: a.siteId })),
    // Al calendario solo llegan los datos necesarios para programar; nada contractual.
    people: data.people.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      siteId: p.siteId,
      areaId: p.areaId,
      positionId: p.positionId,
      positionName: p.positionName,
      isContractor: p.employmentType === "contratista",
    })),
    positions: data.positions.map((p) => ({ id: p.id, name: p.name })),
    templates: data.templates.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      startTime: t.startTime,
      durationMinutes: t.durationMinutes,
      breakMinutes: t.breakMinutes,
      breakTreatment: t.breakTreatment,
      areaId: t.areaId,
      positionId: t.positionId,
    })),
    shifts: data.shifts,
    perms: { edit: auth.can("turnos.editar"), approve: auth.can("turnos.aprobar"), publish: auth.can("turnos.publicar") },
    userId: auth.user.id,
    separationOfDuties: auth.org.separationOfDuties,
  };

  return <CalendarApp data={calendar} />;
}
