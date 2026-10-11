"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { Plus, UserX } from "lucide-react";
import { durationMinutes, toZoned } from "@/lib/time";
import type { CalPerson, CalShift, CreateSeed } from "./types";
import { eventStyle, STATUS_ICONS, timeRange } from "./util";

/** Vista tipo planilla: una fila por persona y una columna por día. */
export function TeamGrid(props: {
  days: string[];
  today: string;
  zone: string;
  shifts: CalShift[];
  people: CalPerson[];
  canEdit: boolean;
  onOpen: (shift: CalShift) => void;
  onCreate: (seed: CreateSeed) => void;
  onPickDay: (date: string) => void;
}) {
  const { cells, totals } = useMemo(() => {
    const cells = new Map<string, CalShift[]>();
    const totals = new Map<string, number>();
    for (const shift of props.shifts) {
      const date = toZoned(shift.startsAt, props.zone).toISODate()!;
      const key = `${shift.personId ?? "vacante"}|${date}`;
      (cells.get(key) ?? cells.set(key, []).get(key)!).push(shift);
      if (shift.personId && shift.status !== "cancelado" && props.days.includes(date)) {
        totals.set(shift.personId, (totals.get(shift.personId) ?? 0) + durationMinutes(shift.startsAt, shift.endsAt));
      }
    }
    return { cells, totals };
  }, [props.shifts, props.zone, props.days]);

  const hasVacant = props.shifts.some((s) => !s.personId);
  const rows: { id: string; person: CalPerson | null }[] = [
    ...(hasVacant ? [{ id: "vacante", person: null }] : []),
    ...props.people.map((person) => ({ id: person.id, person })),
  ];

  return (
    <div className="quiet-scroll min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[980px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 w-[200px] border-b border-line bg-bg px-3 py-2 text-left text-[13px] font-medium text-ink-2">Persona</th>
            {props.days.map((day) => {
              const dt = DateTime.fromISO(day);
              const isToday = day === props.today;
              return (
                <th key={day} className={`sticky top-0 z-20 border-b border-l border-line bg-bg px-2 py-1.5 text-left font-normal ${dt.weekday >= 6 ? "bg-[color-mix(in_srgb,var(--bg)_96%,var(--ink))]" : ""}`}>
                  <button type="button" onClick={() => props.onPickDay(day)} className="flex items-baseline gap-1.5 hover:opacity-70" aria-current={isToday ? "date" : undefined}>
                    <span className={`text-[13px] ${isToday ? "font-medium text-accent-ink" : "text-ink-2"}`}>{dt.toFormat("ccc").replace(".", "")}</span>
                    <span className={`tnum grid h-6 min-w-6 place-items-center rounded-full px-1 text-[15px] leading-none ${isToday ? "bg-accent font-semibold text-white" : "font-medium"}`}>{dt.day}</span>
                  </button>
                </th>
              );
            })}
            <th className="sticky top-0 z-20 w-[84px] border-b border-l border-line bg-bg px-2 py-2 text-right text-[13px] font-medium text-ink-2" title="Suma de la duración de los turnos de la semana, sin descontar pausas">
              Horas
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={props.days.length + 2} className="px-4 py-10 text-center text-ink-2">
                No hay personas activas para mostrar. Regístralas en Personal.
              </td>
            </tr>
          ) : null}
          {rows.map(({ id, person }) => (
            <tr key={id}>
              <th scope="row" className="sticky left-0 z-10 border-b border-line bg-bg px-3 py-2 text-left align-top font-normal">
                {person ? (
                  <>
                    <span className="block truncate font-medium">{person.fullName}</span>
                    <span className="block truncate text-xs text-ink-2">
                      {person.positionName ?? "Sin cargo"}
                      {person.isContractor ? ", contratista" : ""}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-warn">
                    <UserX size={14} aria-hidden /> Sin asignar
                  </span>
                )}
              </th>
              {props.days.map((day) => {
                const shifts = cells.get(`${id}|${day}`) ?? [];
                const weekend = DateTime.fromISO(day).weekday >= 6;
                return (
                  <td key={day} className={`group h-[52px] border-b border-l border-line p-1 align-top ${weekend ? "bg-weekend" : ""}`}>
                    <div className="grid gap-1">
                      {shifts.map((shift) => {
                        const Icon = STATUS_ICONS[shift.status];
                        return (
                          <button
                            key={shift.id}
                            type="button"
                            data-shift={shift.id}
                            data-status={shift.status}
                            data-vacant={shift.personId ? undefined : "true"}
                            onClick={() => props.onOpen(shift)}
                            style={eventStyle(shift.areaColor)}
                            className="ev w-full rounded-[5px] px-1.5 py-1 text-left hover:brightness-[0.97]"
                          >
                            <span className="tnum flex items-center gap-1 text-xs leading-tight font-semibold">
                              <Icon size={11} aria-hidden className="shrink-0 opacity-80" />
                              {timeRange(shift, props.zone)}
                            </span>
                            <span className="block truncate text-[11px] leading-tight opacity-85">{shift.areaName}</span>
                          </button>
                        );
                      })}
                      {props.canEdit && person && shifts.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => props.onCreate({ date: day, personId: person.id })}
                          aria-label={`Programar a ${person.fullName} el ${DateTime.fromISO(day).toFormat("cccc d")}`}
                          className="grid h-[42px] w-full place-items-center rounded-[5px] text-ink-3 opacity-0 hover:bg-fill focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Plus size={15} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                );
              })}
              <td className="tnum border-b border-l border-line px-2 py-2 text-right align-top text-ink-2">
                {person ? formatHours(totals.get(person.id) ?? 0) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatHours(minutes: number): string {
  if (minutes === 0) return "0 h";
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(".", ",")} h`;
}
