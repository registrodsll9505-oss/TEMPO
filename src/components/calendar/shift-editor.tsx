"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Moon, Trash2, X } from "lucide-react";
import { availableTransitions, isEditable, STATUS_LABELS, type Transition } from "@/lib/shift-status";
import { formatMinutes, minuteToTime, toZoned } from "@/lib/time";
import { TimeField } from "@/components/time-field";
import { buttonClass } from "@/components/ui";
import type { ShiftHistoryItem } from "@/app/(app)/calendario/actions";
import type { CalendarData, ShiftDraft } from "./types";
import { siteZoneOf, STATUS_ICONS } from "./util";

type ActionResult = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> };

export type EditorHandlers = {
  save: (draft: ShiftDraft) => Promise<ActionResult>;
  remove: (draft: ShiftDraft) => Promise<ActionResult>;
  transition: (draft: ShiftDraft, key: string, reason: string) => Promise<ActionResult>;
  history: (shiftId: string) => Promise<ShiftHistoryItem[]>;
};

const LABEL = "mb-1 block text-[13px] font-medium";

export function ShiftEditor(props: { data: CalendarData; initial: ShiftDraft; handlers: EditorHandlers; onClose: () => void }) {
  const { data, initial, handlers } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionResult | null>(null);
  const [pendingTransition, setPendingTransition] = useState<Transition | null>(null);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<ShiftHistoryItem[] | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    if (initial.id) {
      handlers.history(initial.id).then((items) => {
        if (alive) setHistory(items);
      });
    }
    return () => {
      alive = false;
    };
  }, [initial.id, handlers]);

  const isNew = draft.id === null;
  const editable = data.perms.edit && isEditable(draft.status);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const zone = siteZoneOf(data, draft.siteId);
  const siteAreas = data.areas.filter((a) => a.siteId === draft.siteId);
  const set = <K extends keyof ShiftDraft>(key: K, value: ShiftDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const [sh, sm] = draft.startTime.split(":").map(Number);
  const [eh, em] = draft.endTime.split(":").map(Number);
  const timesValid = [sh, sm, eh, em].every((n) => Number.isFinite(n));
  let minutes = timesValid ? eh * 60 + em - (sh * 60 + sm) : 0;
  const endsNextDay = timesValid && minutes <= 0;
  if (endsNextDay) minutes += 1440;

  const peopleInArea = data.people.filter((p) => p.areaId === draft.areaId);
  const otherPeople = data.people.filter((p) => p.areaId !== draft.areaId);

  function applyTemplate(templateId: string) {
    const template = data.templates.find((t) => t.id === templateId);
    if (!template) return set("templateId", "");
    const [h, m] = template.startTime.split(":").map(Number);
    setDraft((d) => ({
      ...d,
      templateId,
      startTime: template.startTime.slice(0, 5),
      endTime: minuteToTime(h * 60 + m + template.durationMinutes),
      breakMinutes: template.breakMinutes,
      breakTreatment: template.breakTreatment,
      areaId: template.areaId && data.areas.some((a) => a.id === template.areaId && a.siteId === d.siteId) ? template.areaId : d.areaId,
      positionId: template.positionId ?? d.positionId,
    }));
  }

  function changeSite(siteId: string) {
    setDraft((d) => ({ ...d, siteId, areaId: data.areas.find((a) => a.siteId === siteId)?.id ?? "" }));
  }

  function changePerson(personId: string) {
    const person = data.people.find((p) => p.id === personId);
    setDraft((d) => ({ ...d, personId, positionId: d.positionId || person?.positionId || "" }));
  }

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) props.onClose();
    else setError(result);
  }

  const transitions = isNew
    ? []
    : availableTransitions(draft.status).filter((t) =>
        t.permission === "turnos.editar" ? data.perms.edit : t.permission === "turnos.publicar" ? data.perms.publish : data.perms.approve,
      );
  const blockedBySeparation = (t: Transition) =>
    t.separationOfDuties && data.separationOfDuties && draft.updatedBy !== null && draft.updatedBy === data.userId;
  const StatusIcon = STATUS_ICONS[draft.status];
  const fieldError = (name: string) =>
    error?.fieldErrors?.[name] ? <p className="mt-1 text-[13px] text-danger">{error.fieldErrors[name].join(" ")}</p> : null;

  return (
    <dialog
      ref={dialog}
      onClose={props.onClose}
      aria-labelledby="shift-editor-title"
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(600px,calc(100vw-24px))] overflow-y-auto rounded-2xl bg-raised p-0 shadow-pop"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editable) run(() => handlers.save(draft));
        }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id="shift-editor-title" className="text-[17px] font-semibold">
              {isNew ? "Nuevo turno" : "Turno"}
            </h2>
            {isNew ? null : (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-ink-2">
                <StatusIcon size={14} aria-hidden /> {STATUS_LABELS[draft.status]}
              </p>
            )}
          </div>
          <button type="button" className={buttonClass("ghost", "sm", "!px-0 w-7")} onClick={props.onClose} aria-label="Cerrar">
            <X size={16} aria-hidden />
          </button>
        </div>

        {!isNew && !editable ? (
          <p className="mx-5 mt-3 rounded-lg bg-fill px-3 py-2 text-ink-2">
            {isEditable(draft.status)
              ? "Tu rol permite consultar este turno, no cambiarlo."
              : `Este turno está ${STATUS_LABELS[draft.status].toLowerCase()}. Para cambiar sus datos hay que reabrirlo, y el motivo queda en la auditoría.`}
          </p>
        ) : null}

        <fieldset disabled={!editable || busy} className="grid grid-cols-2 gap-x-3 gap-y-3.5 px-5 py-4">
          {data.templates.length > 0 ? (
            <div className="col-span-2">
              <label htmlFor="se-template" className={LABEL}>
                Plantilla <span className="font-normal text-ink-3">(opcional)</span>
              </label>
              <select id="se-template" className="field-input" value={draft.templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Horario libre</option>
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.startTime.slice(0, 5)}, {formatMinutes(t.durationMinutes)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-site" className={LABEL}>
              Sede
            </label>
            <select id="se-site" className="field-input" required value={draft.siteId} onChange={(e) => changeSite(e.target.value)}>
              {data.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-area" className={LABEL}>
              Área
            </label>
            <select id="se-area" className="field-input" required value={draft.areaId} onChange={(e) => set("areaId", e.target.value)}>
              {siteAreas.length === 0 ? <option value="">Esta sede no tiene áreas</option> : null}
              {siteAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {fieldError("areaId")}
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-person" className={LABEL}>
              Persona
            </label>
            <select id="se-person" className="field-input" value={draft.personId} onChange={(e) => changePerson(e.target.value)}>
              <option value="">Vacante (sin asignar)</option>
              {peopleInArea.length > 0 ? (
                <optgroup label="Del área">
                  {peopleInArea.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {otherPeople.length > 0 ? (
                <optgroup label="Otras personas">
                  {otherPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-position" className={LABEL}>
              Cargo <span className="font-normal text-ink-3">(opcional)</span>
            </label>
            <select id="se-position" className="field-input" value={draft.positionId} onChange={(e) => set("positionId", e.target.value)}>
              <option value="">Sin cargo</option>
              {data.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-date" className={LABEL}>
              Fecha de inicio
            </label>
            <input id="se-date" type="date" className="field-input" required value={draft.date} onChange={(e) => set("date", e.target.value)} />
            {fieldError("date")}
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-1">
            <div>
              <label htmlFor="se-start" className={LABEL}>
                Inicio
              </label>
              <TimeField id="se-start" label="Inicio" value={draft.startTime} onChange={(v) => setDraft((d) => ({ ...d, startTime: v, templateId: "" }))} />
            </div>
            <div>
              <label htmlFor="se-end" className={LABEL}>
                Fin
              </label>
              <TimeField id="se-end" label="Fin" value={draft.endTime} onChange={(v) => setDraft((d) => ({ ...d, endTime: v, templateId: "" }))} />
            </div>
          </div>
          <p className="tnum col-span-2 -mt-1.5 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-2" aria-live="polite">
            {timesValid ? <span>Duración: {formatMinutes(minutes)}</span> : null}
            {endsNextDay && draft.date ? (
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                <Moon size={12} aria-hidden /> Termina al día siguiente, {DateTime.fromISO(draft.date).plus({ days: 1 }).toFormat("cccc d")}
              </span>
            ) : null}
            {zone !== data.zone ? <span>Horas en la zona de la sede ({zone})</span> : null}
          </p>

          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-break" className={LABEL}>
              Pausa (minutos)
            </label>
            <input
              id="se-break"
              type="number"
              min={0}
              max={600}
              step={5}
              className="field-input"
              value={draft.breakMinutes}
              onChange={(e) => set("breakMinutes", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            />
            {fieldError("breakMinutes")}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="se-break-kind" className={LABEL}>
              Tratamiento de la pausa
            </label>
            <select
              id="se-break-kind"
              className="field-input"
              disabled={draft.breakMinutes === 0}
              value={draft.breakTreatment}
              onChange={(e) => set("breakTreatment", e.target.value as ShiftDraft["breakTreatment"])}
            >
              <option value="por_definir">Por definir</option>
              <option value="remunerada">Remunerada</option>
              <option value="no_remunerada">No remunerada</option>
            </select>
          </div>

          <div className="col-span-2">
            <label htmlFor="se-notes" className={LABEL}>
              Notas <span className="font-normal text-ink-3">(opcional)</span>
            </label>
            <textarea id="se-notes" className="field-input" maxLength={500} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </fieldset>

        {error?.message ? (
          <p role="alert" className="mx-5 mb-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-danger">
            {error.message}
          </p>
        ) : null}

        {transitions.length > 0 ? (
          <div className="border-t border-line px-5 py-3.5">
            <p className="mb-2 text-[13px] font-medium">Flujo de aprobación</p>
            <div className="flex flex-wrap gap-2">
              {transitions.map((t) => {
                const blocked = blockedBySeparation(t);
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={buttonClass(t.key === "cancelar" ? "danger" : "secondary", "sm")}
                    disabled={busy || dirty || blocked}
                    title={blocked ? "Separación de funciones: hiciste el último cambio de este turno." : undefined}
                    onClick={() => {
                      setError(null);
                      if (t.requiresReason) {
                        setPendingTransition(t);
                        setReason("");
                      } else {
                        run(() => handlers.transition(draft, t.key, ""));
                      }
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {dirty ? <p className="mt-2 text-[13px] text-ink-2">Guarda los cambios antes de avanzar en el flujo.</p> : null}
            {transitions.some(blockedBySeparation) ? (
              <p className="mt-2 text-[13px] text-ink-2">No puedes aprobar este turno porque hiciste su último cambio. Debe aprobarlo otra persona.</p>
            ) : null}
            {transitions.some((t) => t.key === "aprobar") ? (
              <p className="mt-2 text-[13px] text-ink-2">
                Aprobar registra tu revisión. TEMPO todavía no valida reglas laborales, así que la aprobación no certifica cumplimiento normativo.
              </p>
            ) : null}
            {pendingTransition ? (
              <div className="mt-3 rounded-xl border border-line p-3">
                <label htmlFor="se-reason" className={LABEL}>
                  Motivo para “{pendingTransition.label.toLowerCase()}”
                </label>
                <textarea id="se-reason" autoFocus className="field-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setPendingTransition(null)}>
                    Volver
                  </button>
                  <button
                    type="button"
                    className={buttonClass("primary", "sm")}
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => run(() => handlers.transition(draft, pendingTransition.key, reason))}
                  >
                    {pendingTransition.label}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isNew ? (
          <details className="border-t border-line px-5 py-3">
            <summary className="cursor-pointer text-[13px] font-medium">Historial de cambios</summary>
            {history === null ? (
              <p className="mt-2 text-[13px] text-ink-2">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-2">Sin registros.</p>
            ) : (
              <ol className="mt-2 grid gap-2">
                {history.map((item) => (
                  <li key={item.id} className="text-[13px]">
                    <span className="tnum text-ink-2">{toZoned(item.at, data.zone).toFormat("d LLL, HH:mm")}</span> <span className="font-medium">{item.actorName}</span>
                    <span className="block">{item.summary}</span>
                    {item.reason ? <span className="block text-ink-2">Motivo: {item.reason}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </details>
        ) : null}

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-line bg-raised px-5 py-3.5">
          <div>
            {!isNew && editable && draft.status === "borrador" ? (
              confirmDelete ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-[13px]">¿Eliminar este borrador?</span>
                  <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => run(() => handlers.remove(draft))}>
                    Sí, eliminar
                  </button>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setConfirmDelete(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button type="button" className={buttonClass("ghost", "md", "text-danger")} onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} aria-hidden /> Eliminar
                </button>
              )
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={props.onClose}>
              {editable ? "Cancelar" : "Cerrar"}
            </button>
            {editable ? (
              <button type="submit" className={buttonClass("primary")} disabled={busy || (!isNew && !dirty) || !draft.areaId}>
                {busy ? "Guardando…" : isNew ? "Crear turno" : "Guardar cambios"}
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </dialog>
  );
}
