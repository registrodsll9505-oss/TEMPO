"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { STATUS_LABELS } from "@/lib/shift-status";
import { capitalize, durationMinutes, formatMinutes, toZoned } from "@/lib/time";
import type { CalShift } from "./types";
import { eventStyle, STATUS_ICONS, timeRange } from "./util";

export function ListView(props: { days: string[]; today: string; zone: string; shifts: CalShift[]; onOpen: (shift: CalShift) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, CalShift[]>();
    for (const shift of props.shifts) {
      const date = toZoned(shift.startsAt, props.zone).toISODate()!;
      if (!props.days.includes(date)) continue;
      (map.get(date) ?? map.set(date, []).get(date)!).push(shift);
    }
    return props.days.filter((d) => map.has(d)).map((d) => ({ date: d, shifts: map.get(d)! }));
  }, [props.shifts, props.zone, props.days]);

  if (groups.length === 0) {
    return <p className="px-6 py-12 text-center text-ink-2">No hay turnos en esta semana con los filtros actuales.</p>;
  }

  return (
    <div className="quiet-scroll min-h-0 flex-1 overflow-auto px-4 pb-8 md:px-6">
      {groups.map(({ date, shifts }) => {
        const dt = DateTime.fromISO(date);
        return (
          <section key={date} className="pt-5">
            <h2 className="mb-1.5 flex items-baseline gap-2">
              <span className={`text-[15px] font-semibold ${date === props.today ? "text-accent-ink" : ""}`}>{capitalize(dt.toFormat("cccc d 'de' LLLL"))}</span>
              <span className="text-[13px] text-ink-2">
                {shifts.length} {shifts.length === 1 ? "turno" : "turnos"}
              </span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px]">
                <thead className="sr-only">
                  <tr>
                    <th>Horario</th>
                    <th>Persona</th>
                    <th>Área</th>
                    <th>Sede</th>
                    <th>Duración</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift, index) => {
                    const Icon = STATUS_ICONS[shift.status];
                    return (
                      <tr
                        key={shift.id}
                        data-shift={shift.id}
                        onClick={() => props.onOpen(shift)}
                        className={`cursor-pointer hover:bg-fill ${index > 0 ? "border-t border-line" : ""} ${shift.status === "cancelado" ? "text-ink-3 line-through" : ""}`}
                      >
                        <td className="tnum w-[120px] py-2 pr-2 pl-3 font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-2" style={eventStyle(shift.areaColor)}>
                            <span aria-hidden className="h-4 w-[3px] rounded-full" style={{ background: "var(--ev)" }} />
                            {timeRange(shift, props.zone)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" className="text-left font-medium hover:underline" onClick={(e) => { e.stopPropagation(); props.onOpen(shift); }}>
                            {shift.personName ?? <span className="text-warn italic">Vacante</span>}
                          </button>
                          {shift.positionName ? <span className="ml-2 text-[13px] text-ink-2">{shift.positionName}</span> : null}
                        </td>
                        <td className="px-2 py-2 text-ink-2">{shift.areaName}</td>
                        <td className="px-2 py-2 text-ink-2">{shift.siteName}</td>
                        <td className="tnum px-2 py-2 whitespace-nowrap text-ink-2">{formatMinutes(durationMinutes(shift.startsAt, shift.endsAt))}</td>
                        <td className="py-2 pr-3 pl-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[13px]">
                            <Icon size={13} aria-hidden className="text-ink-2" />
                            {STATUS_LABELS[shift.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
