import { DateTime, Settings } from "luxon";

Settings.defaultLocale = "es-CO";

/**
 * Utilidades de tiempo de TEMPO.
 *
 * Regla: los turnos se guardan como instantes UTC. Toda conversión entre hora local e
 * instante pasa por la zona horaria IANA de la sede. La duración de un turno siempre es
 * tiempo transcurrido real, de modo que un cambio de horario (DST) no la altera.
 */

export type CalendarView = "dia" | "semana" | "mes" | "equipo" | "lista";

export const CALENDAR_VIEWS: CalendarView[] = ["dia", "semana", "mes", "equipo", "lista"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && DateTime.fromISO(value).isValid;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

/** Fecha local de hoy (yyyy-mm-dd) en la zona indicada. */
export function todayIn(zone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone }).toISODate()!;
}

/** Convierte fecha y hora locales de una zona en un instante. */
export function localToInstant(date: string, time: string, zone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time.slice(0, 5)}`, { zone });
  if (!dt.isValid) throw new Error(`Fecha u hora inválida: ${date} ${time} (${zone})`);
  return dt.toJSDate();
}

export function instantToLocal(instant: Date | string, zone: string): { date: string; time: string } {
  const dt = toZoned(instant, zone);
  return { date: dt.toISODate()!, time: dt.toFormat("HH:mm") };
}

export function toZoned(instant: Date | string, zone: string): DateTime {
  return typeof instant === "string"
    ? DateTime.fromISO(instant, { zone })
    : DateTime.fromJSDate(instant, { zone });
}

/**
 * Calcula inicio y fin de un turno a partir de la fecha local, la hora local de inicio y
 * la duración. Si la duración sobrepasa la medianoche, el fin cae en el día siguiente.
 */
export function shiftFromStart(
  date: string,
  startTime: string,
  durationMinutes: number,
  zone: string,
): { startsAt: Date; endsAt: Date } {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
    throw new Error("La duración debe estar entre 1 minuto y 24 horas.");
  }
  const startsAt = localToInstant(date, startTime, zone);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
}

/**
 * Calcula inicio y fin a partir de horas locales de inicio y fin. Si la hora de fin es
 * menor o igual a la de inicio, se entiende que el turno termina al día siguiente.
 */
export function shiftFromTimes(
  date: string,
  startTime: string,
  endTime: string,
  zone: string,
): { startsAt: Date; endsAt: Date; endsNextDay: boolean } {
  const startsAt = localToInstant(date, startTime, zone);
  const endsNextDay = endTime.slice(0, 5) <= startTime.slice(0, 5);
  const endDate = endsNextDay ? DateTime.fromISO(date).plus({ days: 1 }).toISODate()! : date;
  const endsAt = localToInstant(endDate, endTime, zone);
  return { startsAt, endsAt, endsNextDay };
}

export function durationMinutes(startsAt: Date | string, endsAt: Date | string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
}

export function crossesMidnight(startsAt: Date | string, endsAt: Date | string, zone: string): boolean {
  const start = toZoned(startsAt, zone);
  // Un turno que termina exactamente a las 00:00 no ocupa tiempo del día siguiente.
  const lastMoment = toZoned(endsAt, zone).minus({ milliseconds: 1 });
  return start.toISODate() !== lastMoment.toISODate();
}

export type DaySegment = {
  /** Fecha local del segmento. */
  date: string;
  /** Minutos desde las 00:00 locales. */
  startMinute: number;
  endMinute: number;
  isStart: boolean;
  isEnd: boolean;
};

/** Divide un turno en los tramos que ocupa en cada día local. */
export function splitByLocalDay(startsAt: Date | string, endsAt: Date | string, zone: string): DaySegment[] {
  const start = toZoned(startsAt, zone);
  const end = toZoned(endsAt, zone);
  const segments: DaySegment[] = [];
  let cursor = start;
  while (cursor < end) {
    const dayStart = cursor.startOf("day");
    const nextDay = dayStart.plus({ days: 1 });
    const segmentEnd = end < nextDay ? end : nextDay;
    segments.push({
      date: cursor.toISODate()!,
      startMinute: Math.round(cursor.diff(dayStart, "minutes").minutes),
      endMinute: Math.round(segmentEnd.diff(dayStart, "minutes").minutes),
      isStart: cursor.equals(start),
      isEnd: segmentEnd.equals(end),
    });
    cursor = nextDay;
  }
  return segments;
}

/** Lunes de la semana que contiene la fecha. */
export function startOfWeek(date: string): string {
  return DateTime.fromISO(date).startOf("week").toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

export function addMonths(date: string, months: number): string {
  return DateTime.fromISO(date).plus({ months }).toISODate()!;
}

/** Días (yyyy-mm-dd) que muestra cada vista para una fecha ancla. */
export function daysForView(view: CalendarView, anchor: string): string[] {
  if (view === "dia") return [anchor];
  if (view === "mes") {
    const first = DateTime.fromISO(anchor).startOf("month").startOf("week");
    const last = DateTime.fromISO(anchor).endOf("month").endOf("week");
    const count = Math.round(last.diff(first, "days").days);
    return Array.from({ length: count }, (_, i) => first.plus({ days: i }).toISODate()!);
  }
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Rango de instantes [desde, hasta) que cubre una vista en la zona indicada. */
export function rangeForView(view: CalendarView, anchor: string, zone: string): { from: Date; to: Date } {
  const days = daysForView(view, anchor);
  return {
    from: localToInstant(days[0], "00:00", zone),
    to: localToInstant(addDays(days[days.length - 1], 1), "00:00", zone),
  };
}

export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === "dia") return addDays(anchor, direction);
  if (view === "mes") return addMonths(DateTime.fromISO(anchor).startOf("month").toISODate()!, direction);
  return addDays(anchor, 7 * direction);
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

export function minuteToTime(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
