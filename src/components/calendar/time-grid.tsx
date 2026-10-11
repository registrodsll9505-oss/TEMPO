"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { UserX } from "lucide-react";
import { isEditable } from "@/lib/shift-status";
import { minuteToTime, splitByLocalDay, toZoned, type DaySegment } from "@/lib/time";
import type { CalShift, CreateSeed } from "./types";
import { eventStyle, layoutDay, shortName, STATUS_ICONS, timeRange, tinyName, type Laid } from "./util";

/** Uno o varios turnos que ocupan exactamente el mismo tramo horario. */
type Slot = { segment: DaySegment; shifts: CalShift[] };

const HOUR_H = 48;
const SNAP = 15;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Drag = { id: string; mode: "move" | "resize"; dMin: number; dDays: number; columnWidth: number };

export function TimeGrid(props: {
  days: string[];
  today: string;
  zone: string;
  shifts: CalShift[];
  canEdit: boolean;
  /** Agrupa en una pila los turnos con el mismo horario. Se usa en la vista de semana. */
  stack: boolean;
  now: { date: string; minute: number } | null;
  onOpen: (shift: CalShift) => void;
  onCreate: (seed: CreateSeed) => void;
  onMove: (shift: CalShift, startsAt: string, endsAt: string) => void;
  onPickDay: (date: string) => void;
}) {
  const { days, zone, shifts } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragStart = useRef<{ x: number; y: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);

  // Como en un calendario de escritorio: al abrir, la vista arranca cerca del inicio de la jornada.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 5.5 * HOUR_H;
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const day of days) map.set(day, []);
    for (const shift of shifts) {
      for (const segment of splitByLocalDay(shift.startsAt, shift.endsAt, zone)) {
        const slots = map.get(segment.date);
        if (!slots) continue;
        const same = props.stack
          ? slots.find((s) => s.segment.startMinute === segment.startMinute && s.segment.endMinute === segment.endMinute)
          : undefined;
        if (same) same.shifts.push(shift);
        else slots.push({ segment, shifts: [shift] });
      }
    }
    const out = new Map<string, Laid<Slot>[]>();
    for (const [day, items] of map) out.set(day, layoutDay(items));
    return out;
  }, [days, shifts, zone, props.stack]);

  const startedOn = useMemo(() => {
    const map = new Map<string, { total: number; vacant: number }>();
    for (const shift of shifts) {
      if (shift.status === "cancelado") continue;
      const date = toZoned(shift.startsAt, zone).toISODate()!;
      const entry = map.get(date) ?? { total: 0, vacant: 0 };
      entry.total++;
      if (!shift.personId) entry.vacant++;
      map.set(date, entry);
    }
    return map;
  }, [shifts, zone]);

  function onPointerDown(event: React.PointerEvent, shift: CalShift, mode: Drag["mode"]) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (!props.canEdit || !isEditable(shift.status)) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
    const columnWidth = grid.current ? grid.current.getBoundingClientRect().width / days.length : 1;
    setDrag({ id: shift.id, mode, dMin: 0, dDays: 0, columnWidth });
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = dragStart.current;
    if (!start || !drag || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    const dMin = Math.round(((dy / HOUR_H) * 60) / SNAP) * SNAP;
    const dDays = drag.mode === "move" ? Math.round(dx / drag.columnWidth) : 0;
    if (dMin !== drag.dMin || dDays !== drag.dDays) setDrag({ ...drag, dMin, dDays });
  }

  function onPointerUp(event: React.PointerEvent, shift: CalShift) {
    const start = dragStart.current;
    if (!start || !drag || start.pointerId !== event.pointerId) return;
    dragStart.current = null;
    const { dMin, dDays, mode } = drag;
    setDrag(null);
    if (!start.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (dMin === 0 && dDays === 0) return;
    const startAt = toZoned(shift.startsAt, zone);
    const endAt = toZoned(shift.endsAt, zone);
    if (mode === "move") {
      // Se mueve por reloj local: el turno conserva su hora aunque cambie de día.
      const nextStart = startAt.plus({ days: dDays, minutes: dMin });
      const nextEnd = nextStart.plus({ milliseconds: endAt.toMillis() - startAt.toMillis() });
      props.onMove(shift, nextStart.toUTC().toISO()!, nextEnd.toUTC().toISO()!);
    } else {
      const nextEnd = endAt.plus({ minutes: dMin });
      const minutes = nextEnd.diff(startAt, "minutes").minutes;
      if (minutes < SNAP || minutes > 1440) return;
      props.onMove(shift, startAt.toUTC().toISO()!, nextEnd.toUTC().toISO()!);
    }
  }

  function onColumnClick(event: React.MouseEvent<HTMLDivElement>, date: string) {
    if (!props.canEdit || suppressClick.current) return;
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minute = Math.max(0, Math.min(1410, Math.floor((((event.clientY - rect.top) / HOUR_H) * 60) / 30) * 30));
    props.onCreate({ date, startTime: minuteToTime(minute) });
  }

  const single = days.length === 1;
  const nowVisible = props.now !== null && days.includes(props.now.date);

  return (
    <div ref={scroller} className="quiet-scroll min-h-0 flex-1 overflow-auto">
      <div style={{ minWidth: single ? undefined : 56 + days.length * 116 }}>
        <div className="sticky top-0 z-20 flex border-b border-line bg-bg">
          <div className="w-14 shrink-0" />
          {days.map((day) => {
            const dt = DateTime.fromISO(day);
            const isToday = day === props.today;
            const summary = startedOn.get(day);
            return (
              <div key={day} className={`min-w-0 flex-1 border-l border-line px-2 pt-2 pb-1.5 ${dt.weekday >= 6 ? "bg-weekend" : ""}`}>
                <button
                  type="button"
                  onClick={() => props.onPickDay(day)}
                  className="flex items-baseline gap-1.5 rounded-md text-left hover:opacity-70"
                  aria-label={dt.toFormat("cccc d 'de' LLLL")}
                  aria-current={isToday ? "date" : undefined}
                >
                  <span className={`text-[13px] ${isToday ? "font-medium text-accent-ink" : "text-ink-2"}`}>{dt.toFormat("ccc").replace(".", "")}</span>
                  <span
                    className={`tnum grid h-7 min-w-7 place-items-center rounded-full px-1 text-[17px] leading-none ${isToday ? "bg-accent font-semibold text-white" : "font-medium"}`}
                  >
                    {dt.day}
                  </span>
                </button>
                <p className="tnum mt-0.5 flex h-4 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-ink-2">
                  {summary ? (
                    <>
                      <span>
                        {summary.total} {summary.total === 1 ? "turno" : "turnos"}
                      </span>
                      {summary.vacant > 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-medium text-warn" title={`${summary.vacant} sin asignar`}>
                          <UserX size={11} aria-hidden />
                          {summary.vacant}
                          <span className="sr-only"> sin asignar</span>
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>

        <div className="relative flex" style={{ height: 24 * HOUR_H }}>
          <div className="relative w-14 shrink-0" aria-hidden>
            {HOURS.map((h) =>
              // La etiqueta de la hora se oculta si la tapa el marcador de la hora actual.
              h === 0 || (nowVisible && Math.abs(h * 60 - props.now!.minute) < 18) ? null : (
                <span key={h} className="tnum absolute right-2 -translate-y-1/2 text-[11px] text-ink-3" style={{ top: h * HOUR_H }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ),
            )}
            {props.now && nowVisible ? (
              <span
                className="tnum absolute right-1 z-10 -translate-y-1/2 rounded bg-accent px-1 py-px text-[11px] font-semibold text-white"
                style={{ top: (props.now.minute / 60) * HOUR_H }}
              >
                {minuteToTime(props.now.minute)}
              </span>
            ) : null}
          </div>

          <div ref={grid} className="relative flex min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {HOURS.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: h * HOUR_H }} />
              ))}
            </div>
            {days.map((day) => {
              const dt = DateTime.fromISO(day);
              const placed = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  role="group"
                  aria-label={`Turnos del ${dt.toFormat("cccc d 'de' LLLL")}`}
                  className={`relative min-w-0 flex-1 border-l border-line ${dt.weekday >= 6 ? "bg-weekend" : ""} ${props.canEdit ? "cursor-cell" : ""}`}
                  onClick={(event) => onColumnClick(event, day)}
                >
                  {props.now?.date === day ? (
                    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (props.now.minute / 60) * HOUR_H }} aria-hidden>
                      <div className="absolute -top-px right-0 left-0 h-0.5 bg-accent" />
                      <div className="absolute -top-1 -left-1 size-2 rounded-full bg-accent" />
                    </div>
                  ) : null}
                  {placed.map(({ shifts: slotShifts, segment, column, columns }) => {
                    const top = (segment.startMinute / 60) * HOUR_H + 0.5;
                    const left = `calc(${(column / columns) * 100}% + 1px)`;
                    const width = `calc(${100 / columns}% - 3px)`;
                    if (slotShifts.length > 1) {
                      const slotHeight = ((segment.endMinute - segment.startMinute) / 60) * HOUR_H - 1.5;
                      const showHeader = slotHeight > 44;
                      const capacity = Math.max(1, Math.floor((slotHeight - (showHeader ? 17 : 2)) / 19));
                      const visible = slotShifts.length > capacity ? slotShifts.slice(0, Math.max(capacity - 1, 0)) : slotShifts;
                      const rest = slotShifts.length - visible.length;
                      return (
                        <div
                          key={`pila-${segment.startMinute}-${segment.endMinute}`}
                          className="absolute z-[1] cursor-default overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
                          style={{ top, height: slotHeight, left, width }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {showHeader ? (
                            <p className="tnum truncate px-1 pt-0.5 text-[10px] leading-[14px] text-ink-2">
                              {minuteToTime(segment.startMinute)}–{minuteToTime(segment.endMinute)}
                            </p>
                          ) : null}
                          <ul className="grid gap-px px-px pt-px">
                            {visible.map((shift) => {
                              const Icon = STATUS_ICONS[shift.status];
                              return (
                                <li key={shift.id}>
                                  <button
                                    type="button"
                                    data-status={shift.status}
                                    data-vacant={shift.personId ? undefined : "true"}
                                    data-shift={shift.id}
                                    style={eventStyle(shift.areaColor)}
                                    className="ev flex h-[18px] w-full items-center gap-1 rounded-[3px] px-1 text-left text-[11px] leading-none font-medium hover:brightness-[0.96]"
                                    aria-label={`${shift.personName ?? "Turno vacante"}, ${shift.areaName}, ${timeRange(shift, zone)}, ${shift.status.replace("_", " ")}`}
                                    title={`${shift.personName ?? "Vacante"}, ${shift.areaName}`}
                                    onClick={() => props.onOpen(shift)}
                                  >
                                    {columns <= 2 ? <Icon size={10} aria-hidden className="shrink-0 opacity-80" /> : null}
                                    <span className="truncate">{shift.personName ? (columns <= 1 ? shortName(shift.personName) : tinyName(shift.personName)) : "Vacante"}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                          {rest > 0 ? (
                            <button type="button" className="mt-px h-[18px] w-full truncate px-1 text-left text-[11px] font-medium text-ink-2 hover:text-ink" onClick={() => props.onPickDay(day)}>
                              {rest} más
                            </button>
                          ) : null}
                        </div>
                      );
                    }
                    const shift = slotShifts[0];
                    const dragging = drag?.id === shift.id && (drag.dMin !== 0 || drag.dDays !== 0);
                    const baseHeight = ((segment.endMinute - segment.startMinute) / 60) * HOUR_H;
                    const extra = dragging && drag.mode === "resize" && segment.isEnd ? (drag.dMin / 60) * HOUR_H : 0;
                    const height = Math.max(baseHeight + extra - 1.5, 15);
                    const movable = props.canEdit && isEditable(shift.status);
                    const Icon = STATUS_ICONS[shift.status];
                    const compact = height < 32;
                    const label = shift.personName ? (columns > 2 ? shortName(shift.personName) : shift.personName) : "Vacante";
                    return (
                      <button
                        key={`${shift.id}-${segment.date}`}
                        type="button"
                        data-status={shift.status}
                        data-vacant={shift.personId ? undefined : "true"}
                        data-shift={shift.id}
                        className={`ev absolute flex flex-col justify-start overflow-hidden rounded-[5px] px-1.5 py-0.5 text-left ${movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${dragging ? "z-30 opacity-85 shadow-pop" : "z-[1] hover:z-[2] hover:brightness-[0.97]"}`}
                        style={{
                          ...eventStyle(shift.areaColor),
                          top,
                          height,
                          left,
                          width,
                          transform:
                            dragging && drag.mode === "move"
                              ? `translate(${drag.dDays * drag.columnWidth}px, ${(drag.dMin / 60) * HOUR_H}px)`
                              : undefined,
                          touchAction: "manipulation",
                        }}
                        aria-label={`${shift.personName ?? "Turno vacante"}, ${shift.areaName}, ${timeRange(shift, zone)}, ${shift.status.replace("_", " ")}`}
                        onPointerDown={(event) => onPointerDown(event, shift, "move")}
                        onPointerMove={onPointerMove}
                        onPointerUp={(event) => onPointerUp(event, shift)}
                        onPointerCancel={() => {
                          dragStart.current = null;
                          setDrag(null);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressClick.current) return;
                          props.onOpen(shift);
                        }}
                      >
                        <span className={`flex items-center gap-1 text-xs leading-[1.25] font-semibold ${compact ? "" : "pt-px"}`}>
                          <Icon size={11} aria-hidden className="shrink-0 opacity-80" />
                          <span className="truncate">{label}</span>
                          {compact ? <span className="tnum ml-auto shrink-0 pl-1 font-normal opacity-85">{timeRange(shift, zone)}</span> : null}
                        </span>
                        {compact ? null : (
                          <>
                            <span className="tnum block truncate text-[11px] leading-[1.3] opacity-90">{timeRange(shift, zone)}</span>
                            {height > 58 ? (
                              <span className="block truncate text-[11px] leading-[1.3] opacity-80">{shift.positionName ?? shift.areaName}</span>
                            ) : null}
                          </>
                        )}
                        {movable && segment.isEnd ? (
                          <span
                            aria-hidden
                            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                            onPointerDown={(event) => onPointerDown(event, shift, "resize")}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
