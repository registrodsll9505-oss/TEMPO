"use client";

import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * Selector de hora en formato de 24 horas. Se usa en lugar de <input type="time"> porque
 * ese control sigue la configuración regional del navegador y puede mostrar a. m. / p. m.
 */
export function TimeField(props: {
  id: string;
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [inner, setInner] = useState(props.defaultValue?.slice(0, 5) || "06:00");
  const current = (props.value ?? inner).slice(0, 5);
  const [hour = "06", minute = "00"] = current.split(":");
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();
  const update = (next: string) => {
    setInner(next);
    props.onChange?.(next);
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={props.label}>
      {props.name ? <input type="hidden" name={props.name} value={current} /> : null}
      <select id={props.id} aria-label={`${props.label}: hora`} className="field-input tnum !px-1.5" disabled={props.disabled} value={hour} onChange={(e) => update(`${e.target.value}:${minute}`)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden className="font-medium text-ink-2">
        :
      </span>
      <select aria-label={`${props.label}: minutos`} className="field-input tnum !px-1.5" disabled={props.disabled} value={minute} onChange={(e) => update(`${hour}:${e.target.value}`)}>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
