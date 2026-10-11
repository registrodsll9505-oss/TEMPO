import { Ban, Check, CircleDashed, Hourglass, Megaphone, MessageSquareWarning, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { ShiftStatus } from "@/db/schema";
import { areaColor } from "@/lib/colors";
import { instantToLocal, toZoned, type DaySegment } from "@/lib/time";
import type { CalendarData, CalShift, CreateSeed, ShiftDraft } from "./types";

export const STATUS_ICONS: Record<ShiftStatus, LucideIcon> = {
  borrador: CircleDashed,
  pendiente_validacion: Hourglass,
  con_observaciones: MessageSquareWarning,
  pendiente_aprobacion: Hourglass,
  aprobado: Check,
  publicado: Megaphone,
  confirmado: Check,
  en_ejecucion: Check,
  ejecutado: Check,
  cancelado: Ban,
};

export function eventStyle(color: string): CSSProperties {
  const c = areaColor(color);
  return { "--ev": c.solid, "--ev-ink-l": c.ink, "--ev-ink-d": c.inkDark } as CSSProperties;
}

export function timeRange(shift: CalShift, zone: string): string {
  return `${toZoned(shift.startsAt, zone).toFormat("HH:mm")}–${toZoned(shift.endsAt, zone).toFormat("HH:mm")}`;
}

export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length <= 2 ? fullName : `${parts[0]} ${parts[parts.length >= 4 ? 2 : 1]}`;
}

/** Nombre y primera letra del apellido, para espacios angostos. */
export function tinyName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const surname = parts[parts.length >= 4 ? 2 : 1];
  return `${parts[0]} ${surname[0]}.`;
}

export type Laid<T> = T & { column: number; columns: number };

/** Reparte en columnas los tramos que se solapan dentro de un día. */
export function layoutDay<T extends { segment: DaySegment }>(items: T[]): Laid<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.segment.startMinute - b.segment.startMinute || b.segment.endMinute - a.segment.endMinute,
  );
  const placed: Laid<T>[] = [];
  let cluster: Laid<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const item of sorted) {
    if (cluster.length > 0 && item.segment.startMinute >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.segment.startMinute);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.segment.endMinute);
    } else {
      columnEnds[column] = item.segment.endMinute;
    }
    clusterEnd = Math.max(clusterEnd, item.segment.endMinute);
    const entry: Laid<T> = { ...item, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
  }
  flush();
  return placed;
}

export function siteZoneOf(data: CalendarData, siteId: string): string {
  return data.sites.find((s) => s.id === siteId)?.zone ?? data.zone;
}

export function draftFromShift(shift: CalShift, data: CalendarData): ShiftDraft {
  const zone = siteZoneOf(data, shift.siteId);
  const start = instantToLocal(shift.startsAt, zone);
  const end = instantToLocal(shift.endsAt, zone);
  return {
    id: shift.id,
    version: shift.version,
    status: shift.status,
    updatedBy: shift.updatedBy,
    siteId: shift.siteId,
    areaId: shift.areaId,
    personId: shift.personId ?? "",
    positionId: shift.positionId ?? "",
    templateId: shift.templateId ?? "",
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    breakMinutes: shift.breakMinutes,
    breakTreatment: shift.breakTreatment,
    notes: shift.notes ?? "",
  };
}

export function emptyDraft(seed: CreateSeed, data: CalendarData): ShiftDraft {
  const person = seed.personId ? data.people.find((p) => p.id === seed.personId) : undefined;
  const siteId = data.siteId ?? person?.siteId ?? data.sites[0]?.id ?? "";
  const siteAreas = data.areas.filter((a) => a.siteId === siteId);
  const areaId = (person?.areaId && siteAreas.some((a) => a.id === person.areaId) ? person.areaId : siteAreas[0]?.id) ?? "";
  const startTime = seed.startTime ?? "06:00";
  const [h, m] = startTime.split(":").map(Number);
  const endMinute = (h * 60 + m + 480) % 1440;
  return {
    id: null,
    version: null,
    status: "borrador",
    updatedBy: null,
    siteId,
    areaId,
    personId: person?.id ?? "",
    positionId: person?.positionId ?? "",
    templateId: "",
    date: seed.date,
    startTime,
    endTime: `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`,
    breakMinutes: 0,
    breakTreatment: "por_definir",
    notes: "",
  };
}
