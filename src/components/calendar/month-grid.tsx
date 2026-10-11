"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { toZoned } from "@/lib/time";
import type { CalShift, CreateSeed } from "./types";
import { eventStyle, shortName, STATUS_ICONS } from "./util";

const MAX_VISIBLE = 4;
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function MonthGrid(props: {
  days: string[];
  anchor: string;
  today: string;
  zone: string;
  shifts: CalShift[];
  canEdit: boolean;
  onOpen: (shift: CalShift) => void;
  onCreate: (seed: CreateSeed) => void;
  onPickDay: (date: string) => void;
}) {
  const month = DateTime.fromISO(props.anchor).month;
  const byDay = useMemo(() => {
    const map = new Map<string, CalShift[]>();
    for (const shift of props.shifts) {
      const date = toZoned(shift.startsAt, props.zone).toISODate()!;
      (map.get(date) ?? map.set(date, []).get(date)!).push(shift);
    }
    return map;
  }, [props.shifts, props.zone]);
  const weeks = props.days.length / 7;

  return (
    <div className="quiet-scroll flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex min-w-[720px] flex-1 flex-col">
        <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-line bg-bg">
          {WEEKDAYS.map((name, index) => (
            <div key={name} className={`px-2 py-1.5 text-right text-[13px] text-ink-2 ${index >= 5 ? "bg-weekend" : ""}`}>
              {name}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(118px, 1fr))` }}>
          {props.days.map((day) => {
            const dt = DateTime.fromISO(day);
            const isToday = day === props.today;
            const outside = dt.month !== month;
            const shifts = byDay.get(day) ?? [];
            const visible = shifts.slice(0, shifts.length > MAX_VISIBLE ? MAX_VISIBLE - 1 : MAX_VISIBLE);
            const hidden = shifts.length - visible.length;
            return (
              <div
                key={day}
                className={`group relative min-w-0 border-b border-l border-line px-1 pt-1 pb-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${dt.weekday >= 6 ? "bg-weekend" : ""} ${props.canEdit ? "cursor-cell" : ""}`}
                onClick={(event) => {
                  if (props.canEdit && event.target === event.currentTarget) props.onCreate({ date: day });
                }}
              >
                <div className="pointer-events-none mb-0.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => props.onPickDay(day)}
                    aria-label={`Ver el ${dt.toFormat("d 'de' LLLL")}`}
                    aria-current={isToday ? "date" : undefined}
                    className={`tnum pointer-events-auto grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[13px] hover:bg-fill ${isToday ? "bg-accent font-semibold text-white hover:bg-accent" : outside ? "text-ink-3" : "font-medium"}`}
                  >
                    {dt.day === 1 ? dt.toFormat("d LLL").replace(".", "") : dt.day}
                  </button>
                </div>
                <ul className={`pointer-events-none grid gap-px ${outside ? "opacity-55" : ""}`}>
                  {visible.map((shift) => {
                    const Icon = STATUS_ICONS[shift.status];
                    const published = shift.status === "publicado";
                    return (
                      <li key={shift.id}>
                        <button
                          type="button"
                          data-shift={shift.id}
                          data-status={shift.status}
                          data-vacant={shift.personId ? undefined : "true"}
                          onClick={() => props.onOpen(shift)}
                          style={eventStyle(shift.areaColor)}
                          className={`pointer-events-auto flex h-[19px] w-full items-center gap-1 rounded px-1 text-left text-xs leading-none hover:bg-fill ${published ? "ev !border-l-0 font-medium" : ""} ${shift.status === "cancelado" ? "text-ink-3 line-through" : ""}`}
                        >
                          {published ? null : (
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={
                                shift.status === "borrador" || shift.status === "con_observaciones"
                                  ? { boxShadow: "inset 0 0 0 1.5px var(--ev)" }
                                  : { background: "var(--ev)" }
                              }
                            />
                          )}
                          <span className={`min-w-0 flex-1 truncate ${shift.personId ? "" : "italic"}`}>
                            {shift.personName ? shortName(shift.personName) : "Vacante"}
                          </span>
                          <Icon size={10} aria-hidden className="shrink-0 opacity-60" />
                          <span className={`tnum shrink-0 ${published ? "" : "text-ink-2"}`}>{toZoned(shift.startsAt, props.zone).toFormat("HH:mm")}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => props.onPickDay(day)}
                    className="mt-px h-[19px] w-full rounded px-1 text-left text-xs font-medium text-ink-2 hover:bg-fill"
                  >
                    {hidden} más
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
