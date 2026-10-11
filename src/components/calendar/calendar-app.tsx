"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import { Check, ChevronLeft, ChevronRight, CopyPlus, Plus, Search, X } from "lucide-react";
import { copyWeek, deleteShift, getShiftHistory, moveShift, saveShift, transitionShift } from "@/app/(app)/calendario/actions";
import { areaColor } from "@/lib/colors";
import { addDays, capitalize, daysForView, shiftAnchor, startOfWeek, toZoned, type CalendarView } from "@/lib/time";
import { buttonClass } from "@/components/ui";
import { ListView } from "./list-view";
import { MiniCalendar } from "./mini-calendar";
import { MonthGrid } from "./month-grid";
import { ShiftEditor, type EditorHandlers } from "./shift-editor";
import { TeamGrid } from "./team-grid";
import { TimeGrid } from "./time-grid";
import type { CalendarData, CalShift, CreateSeed, ShiftDraft } from "./types";
import { draftFromShift, emptyDraft, STATUS_ICONS } from "./util";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "equipo", label: "Equipo" },
  { key: "lista", label: "Lista" },
];

const HIDDEN_KEY = "tempo-areas-ocultas";

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const subscribeNoop = () => () => {};

const NARROW = "(max-width: 767px)";
function subscribeNarrow(callback: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function CalendarApp({ data }: { data: CalendarData }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  // En pantallas angostas también la vista de día agrupa los turnos simultáneos.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ key: number; shiftId: string | null; draft: ShiftDraft } | null>(null);
  // Mientras una acción está en curso y hasta que llegan los datos actualizados, el calendario
  // no acepta clics: así nunca se abre un turno con una versión que ya cambió.
  const [syncing, startAction] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState<{ date: string; minute: number } | null>(null);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [copying, setCopying] = useState(false);

  if (mounted && !hiddenLoaded) {
    setHiddenLoaded(true);
    setHidden(readHidden());
  }

  useEffect(() => {
    const tick = () => {
      const dt = DateTime.now().setZone(data.zone);
      setNow({ date: dt.toISODate()!, minute: dt.hour * 60 + dt.minute });
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [data.zone]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.ok ? 4500 : 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = useCallback(
    (next: { view?: CalendarView; anchor?: string; siteId?: string | null }) => {
      const params = new URLSearchParams();
      params.set("vista", next.view ?? data.view);
      params.set("fecha", next.anchor ?? data.anchor);
      const site = next.siteId === undefined ? data.siteId : next.siteId;
      if (site) params.set("sede", site);
      startNavigation(() => router.push(`/calendario?${params.toString()}`));
    },
    [data.view, data.anchor, data.siteId, router],
  );

  // Atajos de teclado al estilo de un calendario de escritorio.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest("input, textarea, select, dialog, [contenteditable]")) return;
      if (event.key === "t" || event.key === "T") go({ anchor: data.today });
      else if (event.key === "ArrowLeft") go({ anchor: shiftAnchor(data.view, data.anchor, -1) });
      else if (event.key === "ArrowRight") go({ anchor: shiftAnchor(data.view, data.anchor, 1) });
      else if (event.key === "d" || event.key === "D") go({ view: "dia" });
      else if (event.key === "s" || event.key === "S") go({ view: "semana" });
      else if (event.key === "m" || event.key === "M") go({ view: "mes" });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, data.today, data.view, data.anchor]);

  const days = useMemo(() => daysForView(data.view, data.anchor), [data.view, data.anchor]);
  const visibleAreas = useMemo(() => data.areas.filter((a) => !data.siteId || a.siteId === data.siteId), [data.areas, data.siteId]);

  const shifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hiddenSet = new Set(hidden);
    return data.shifts.filter(
      (s) =>
        !hiddenSet.has(s.areaId) &&
        (!q || (s.personName ?? "vacante").toLowerCase().includes(q) || s.areaName.toLowerCase().includes(q) || (s.positionName ?? "").toLowerCase().includes(q)),
    );
  }, [data.shifts, hidden, query]);

  const teamPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hiddenSet = new Set(hidden);
    return data.people.filter(
      (p) =>
        (!data.siteId || p.siteId === data.siteId || p.siteId === null) &&
        (!p.areaId || !hiddenSet.has(p.areaId)) &&
        (!q || p.fullName.toLowerCase().includes(q)),
    );
  }, [data.people, data.siteId, hidden, query]);

  function toggleArea(areaId: string) {
    setHidden((current) => {
      const next = current.includes(areaId) ? current.filter((id) => id !== areaId) : [...current, areaId];
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch {
        // La preferencia solo dura esta visita.
      }
      return next;
    });
  }

  const runAction = useCallback(
    <T,>(action: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        startAction(async () => {
          try {
            resolve(await action());
          } catch (error) {
            reject(error);
          }
        });
      }),
    [],
  );

  const openShift = useCallback((shift: CalShift) => setEditor({ key: Date.now(), shiftId: shift.id, draft: draftFromShift(shift, data) }), [data]);
  const createShift = useCallback(
    (seed: CreateSeed) => {
      if (data.sites.length === 0 || data.areas.length === 0) {
        setToast({ ok: false, text: "Para programar turnos primero crea una sede y un área en Estructura." });
        return;
      }
      setEditor({ key: Date.now(), shiftId: null, draft: emptyDraft(seed, data) });
    },
    [data],
  );

  const handlers: EditorHandlers = useMemo(
    () => ({
      save: async (draft) => {
        const result = await runAction(() => saveShift({
          id: draft.id ?? "",
          version: draft.version,
          siteId: draft.siteId,
          areaId: draft.areaId,
          personId: draft.personId,
          positionId: draft.positionId,
          templateId: draft.templateId,
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
          breakMinutes: draft.breakMinutes,
          breakTreatment: draft.breakTreatment,
          notes: draft.notes,
        }));
        if (result.ok) setToast({ ok: true, text: draft.id ? "Turno guardado." : "Turno creado como borrador." });
        return result;
      },
      remove: async (draft) => {
        const result = await runAction(() => deleteShift({ id: draft.id, version: draft.version }));
        if (result.ok) setToast({ ok: true, text: "Borrador eliminado." });
        return result;
      },
      transition: async (draft, key, reason) => {
        const result = await runAction(() => transitionShift({ id: draft.id, version: draft.version, key, reason }));
        if (result.ok) setToast({ ok: true, text: "Estado del turno actualizado." });
        return result;
      },
      history: getShiftHistory,
    }),
    [runAction],
  );

  async function onMove(shift: CalShift, startsAt: string, endsAt: string) {
    const result = await runAction(() => moveShift({ id: shift.id, version: shift.version, startsAt, endsAt }));
    if (!result.ok) setToast({ ok: false, text: result.message ?? "No se pudo mover el turno." });
    else {
      const start = toZoned(startsAt, data.zone);
      setToast({ ok: true, text: `Turno movido a ${start.toFormat("cccc d, HH:mm")}.` });
    }
  }

  async function onCopyWeek() {
    setCopying(true);
    const result = await runAction(() => copyWeek({ weekStart: startOfWeek(data.anchor), siteId: data.siteId ?? "" }));
    setCopying(false);
    setConfirmCopy(false);
    setToast({ ok: result.ok, text: result.message ?? (result.ok ? "Semana copiada." : "No se pudo copiar la semana.") });
    if (result.ok) go({ anchor: addDays(data.anchor, 7) });
  }

  const anchorDt = DateTime.fromISO(data.anchor);
  const first = DateTime.fromISO(days[0]);
  const last = DateTime.fromISO(days[days.length - 1]);
  let titleMain: string;
  let titleRest: string;
  if (data.view === "dia") {
    titleMain = capitalize(anchorDt.toFormat("d 'de' LLLL"));
    titleRest = `${anchorDt.year}, ${anchorDt.toFormat("cccc")}`;
  } else if (data.view === "mes" || first.month === last.month) {
    titleMain = capitalize((data.view === "mes" ? anchorDt : first).toFormat("LLLL"));
    titleRest = String((data.view === "mes" ? anchorDt : first).year);
  } else {
    titleMain = `${capitalize(first.toFormat("LLL").replace(".", ""))} – ${capitalize(last.toFormat("LLL").replace(".", ""))}`;
    titleRest = String(last.year);
  }

  const editorShift = editor?.shiftId ? data.shifts.find((shift) => shift.id === editor.shiftId) : undefined;
  const weekViews = data.view === "semana" || data.view === "equipo" || data.view === "lista";
  const sidebarSlot = mounted ? document.getElementById("sidebar-slot") : null;
  const pick = (date: string) => go({ view: "dia", anchor: date });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de herramientas */}
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-sidebar px-3 py-2 md:px-4">
        {data.perms.edit ? (
          <button type="button" className={buttonClass("secondary", "md", "!h-8 !px-2.5")} onClick={() => createShift({ date: data.view === "mes" ? data.today : data.anchor })} title="Nuevo turno">
            <Plus size={16} aria-hidden />
            <span className="hidden lg:inline">Nuevo turno</span>
            <span className="sr-only lg:hidden">Nuevo turno</span>
          </button>
        ) : null}

        <div className="order-3 flex w-full justify-center sm:order-none sm:w-auto sm:flex-1">
          <div className="flex rounded-lg bg-fill p-0.5" role="group" aria-label="Vista del calendario">
            {VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                aria-pressed={data.view === view.key}
                onClick={() => go({ view: view.key })}
                className={`h-7 rounded-md px-3 text-[13px] font-medium ${data.view === view.key ? "bg-raised shadow-[0_0_0_0.5px_var(--line-strong),0_1px_2px_rgba(0,0,0,0.12)]" : "text-ink-2 hover:text-ink"}`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <label className="relative hidden md:block">
            <span className="sr-only">Buscar persona, área o cargo</span>
            <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="h-8 w-40 rounded-lg border border-transparent bg-fill pr-2 pl-7 text-[13px] placeholder:text-ink-3 focus:w-52 focus:border-line-strong focus:bg-raised"
            />
          </label>
          <div className="flex items-center rounded-lg bg-fill p-0.5">
            <button type="button" aria-label="Anterior" className="grid h-7 w-7 place-items-center rounded-md hover:bg-fill-2" onClick={() => go({ anchor: shiftAnchor(data.view, data.anchor, -1) })}>
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button type="button" className="h-7 rounded-md px-2.5 text-[13px] font-medium hover:bg-fill-2" onClick={() => go({ anchor: data.today })}>
              Hoy
            </button>
            <button type="button" aria-label="Siguiente" className="grid h-7 w-7 place-items-center rounded-md hover:bg-fill-2" onClick={() => go({ anchor: shiftAnchor(data.view, data.anchor, 1) })}>
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Título */}
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-3.5 pb-2.5 md:px-5">
        <h1 className={`text-[26px] leading-none tracking-[-0.01em] transition-opacity ${navigating ? "opacity-50" : ""}`}>
          <span className="font-bold">{titleMain}</span> <span className="font-light text-ink-2">{titleRest}</span>
        </h1>
        <div className="no-print flex items-center gap-2">
          {weekViews && data.perms.edit ? (
            confirmCopy ? (
              <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-fill px-2.5 py-1 text-[13px]">
                Copiar esta semana a la siguiente como borradores
                <button type="button" className={buttonClass("primary", "sm")} disabled={copying} onClick={onCopyWeek}>
                  {copying ? "Copiando…" : "Copiar"}
                </button>
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setConfirmCopy(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setConfirmCopy(true)}>
                <CopyPlus size={14} aria-hidden /> Copiar semana
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col" inert={syncing} aria-busy={syncing}>
        {data.view === "dia" || data.view === "semana" ? (
          <TimeGrid key={`${data.view}-${data.anchor}`} days={days} today={data.today} zone={data.zone} shifts={shifts} canEdit={data.perms.edit} stack={data.view === "semana" || narrow} now={now} onOpen={openShift} onCreate={createShift} onMove={onMove} onPickDay={pick} />
        ) : data.view === "mes" ? (
          <MonthGrid days={days} anchor={data.anchor} today={data.today} zone={data.zone} shifts={shifts} canEdit={data.perms.edit} onOpen={openShift} onCreate={createShift} onPickDay={pick} />
        ) : data.view === "equipo" ? (
          <TeamGrid days={days} today={data.today} zone={data.zone} shifts={shifts} people={teamPeople} canEdit={data.perms.edit} onOpen={openShift} onCreate={createShift} onPickDay={pick} />
        ) : (
          <ListView days={days} today={data.today} zone={data.zone} shifts={shifts} onOpen={openShift} />
        )}
      </div>

      {editor ? (
        // Si el turno abierto cambia en el servidor, el editor se vuelve a cargar con la versión nueva.
        <ShiftEditor
          key={`${editor.key}:${editorShift?.version ?? 0}`}
          data={data}
          initial={editorShift ? draftFromShift(editorShift, data) : editor.draft}
          handlers={handlers}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {toast ? (
        <div role={toast.ok ? "status" : "alert"} className="no-print fixed bottom-5 left-1/2 z-[60] flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-start gap-2.5 rounded-xl bg-raised px-3.5 py-2.5 shadow-pop">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white ${toast.ok ? "bg-[var(--ok)]" : "bg-[var(--danger)]"}`}>
            {toast.ok ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
          </span>
          <p className="min-w-0 flex-1">{toast.text}</p>
          <button type="button" aria-label="Cerrar aviso" className="grid size-6 place-items-center rounded hover:bg-fill" onClick={() => setToast(null)}>
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      {sidebarSlot
        ? createPortal(
            <div className="flex min-h-full flex-col">
              <div className="px-3">
                <label htmlFor="cal-site" className="mb-1 block px-1.5 text-xs font-medium text-ink-2">
                  Sede
                </label>
                <select id="cal-site" className="field-input !min-h-8 !py-1 text-[13px]" value={data.siteId ?? ""} onChange={(e) => go({ siteId: e.target.value || null })}>
                  <option value="">Todas las sedes</option>
                  {data.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="mt-3 px-3">
                <legend className="mb-0.5 px-1.5 text-xs font-medium text-ink-2">Áreas</legend>
                {visibleAreas.length === 0 ? <p className="px-1.5 text-[13px] text-ink-2">Sin áreas todavía.</p> : null}
                {visibleAreas.map((area) => {
                  const shown = !hidden.includes(area.id);
                  return (
                    <label key={area.id} className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-fill">
                      <input type="checkbox" className="peer sr-only" checked={shown} onChange={() => toggleArea(area.id)} />
                      <span
                        aria-hidden
                        className="grid size-[15px] shrink-0 place-items-center rounded-full text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus)] peer-focus-visible:ring-offset-1"
                        style={shown ? { background: areaColor(area.color).solid } : { boxShadow: `inset 0 0 0 1.5px ${areaColor(area.color).solid}` }}
                      >
                        {shown ? <Check size={10} strokeWidth={3.5} /> : null}
                      </span>
                      <span className="truncate">{area.name}</span>
                    </label>
                  );
                })}
              </fieldset>

              <details className="mt-3 px-3">
                <summary className="mb-1 cursor-pointer rounded px-1.5 text-xs font-medium text-ink-2 hover:text-ink">Cómo leer los estados</summary>
                <ul className="grid gap-1 px-1.5 text-xs text-ink-2">
                  {(
                    [
                      ["borrador", "Borrador"],
                      ["pendiente_aprobacion", "Pendiente de aprobación"],
                      ["aprobado", "Aprobado"],
                      ["publicado", "Publicado"],
                    ] as const
                  ).map(([status, label]) => {
                    const Icon = STATUS_ICONS[status];
                    return (
                      <li key={status} className="flex items-center gap-2">
                        <span data-status={status} className="ev grid h-4 w-7 place-items-center rounded-[3px] !border-l-2" style={{ "--ev": "var(--ink-2)", "--ev-ink-l": "var(--ink)", "--ev-ink-d": "var(--ink)" } as React.CSSProperties}>
                          <Icon size={10} aria-hidden />
                        </span>
                        {label}
                      </li>
                    );
                  })}
                  <li className="flex items-center gap-2">
                    <span data-vacant="true" className="ev h-4 w-7 rounded-[3px] !border-l-2" style={{ "--ev": "var(--ink-2)" } as React.CSSProperties} />
                    Vacante, sin persona
                  </li>
                </ul>
              </details>

              <div className="mt-auto shrink-0 border-t border-line pt-1">
                <MiniCalendar anchor={data.anchor} today={data.today} highlighted={data.view === "mes" ? [] : days} onPick={(date) => go({ anchor: date })} />
              </div>
            </div>,
            sidebarSlot,
          )
        : null}
    </div>
  );
}
