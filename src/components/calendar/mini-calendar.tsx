"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { capitalize, daysForView } from "@/lib/time";

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

export function MiniCalendar(props: { anchor: string; today: string; highlighted: string[]; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(() => DateTime.fromISO(props.anchor).startOf("month").toISODate()!);
  const [seenAnchor, setSeenAnchor] = useState(props.anchor);
  // Si la vista principal cambia de fecha, el calendario pequeño la sigue.
  if (seenAnchor !== props.anchor) {
    setSeenAnchor(props.anchor);
    setMonth(DateTime.fromISO(props.anchor).startOf("month").toISODate()!);
  }
  const dt = DateTime.fromISO(month);
  const days = daysForView("mes", month);
  const highlighted = new Set(props.highlighted);

  return (
    <div className="px-3 pt-1.5 pb-2">
      <div className="mb-1 flex items-center justify-between pl-1.5">
        <p className="text-[13px] font-semibold">
          {capitalize(dt.toFormat("LLLL"))} <span className="font-normal text-ink-2">{dt.year}</span>
        </p>
        <div className="flex">
          <button type="button" aria-label="Mes anterior" className="grid size-6 place-items-center rounded hover:bg-fill" onClick={() => setMonth(dt.minus({ months: 1 }).toISODate()!)}>
            <ChevronLeft size={14} aria-hidden />
          </button>
          <button type="button" aria-label="Mes siguiente" className="grid size-6 place-items-center rounded hover:bg-fill" onClick={() => setMonth(dt.plus({ months: 1 }).toISODate()!)}>
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {LETTERS.map((letter, index) => (
          <span key={index} className="py-0.5 text-[11px] text-ink-3" aria-hidden>
            {letter}
          </span>
        ))}
        {days.map((day) => {
          const d = DateTime.fromISO(day);
          const outside = d.month !== dt.month;
          const isToday = day === props.today;
          const inView = highlighted.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => props.onPick(day)}
              aria-label={d.toFormat("d 'de' LLLL")}
              aria-current={isToday ? "date" : undefined}
              className={`tnum mx-auto grid size-[24px] place-items-center rounded-full text-xs ${isToday ? "bg-accent font-semibold text-white" : inView ? "bg-fill-2 font-medium" : "hover:bg-fill"} ${outside && !isToday ? "text-ink-3" : ""}`}
            >
              {d.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
