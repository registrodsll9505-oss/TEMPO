import type { ShiftStatus } from "@/db/schema";
import type { Permission } from "./permissions";

export const STATUS_LABELS: Record<ShiftStatus, string> = {
  borrador: "Borrador",
  pendiente_validacion: "Pendiente de validación",
  con_observaciones: "Con observaciones",
  pendiente_aprobacion: "Pendiente de aprobación",
  aprobado: "Aprobado",
  publicado: "Publicado",
  confirmado: "Confirmado",
  en_ejecucion: "En ejecución",
  ejecutado: "Ejecutado",
  cancelado: "Cancelado",
};

export type TransitionKey = "enviar" | "aprobar" | "devolver" | "publicar" | "reabrir" | "cancelar";

export type Transition = {
  key: TransitionKey;
  label: string;
  from: readonly ShiftStatus[];
  to: ShiftStatus;
  permission: Permission;
  /** Exige un motivo escrito, que queda en la auditoría. */
  requiresReason: boolean;
  /** Sujeta a separación de funciones: quien hizo el último cambio no puede ejecutarla. */
  separationOfDuties: boolean;
};

/**
 * Transiciones habilitadas en la Fase 1. Los estados pendiente_validacion, confirmado,
 * en_ejecucion y ejecutado existen en el modelo pero se activan con el motor de reglas
 * y el control de asistencia.
 */
export const TRANSITIONS: readonly Transition[] = [
  {
    key: "enviar",
    label: "Enviar a aprobación",
    from: ["borrador", "con_observaciones"],
    to: "pendiente_aprobacion",
    permission: "turnos.editar",
    requiresReason: false,
    separationOfDuties: false,
  },
  {
    key: "aprobar",
    label: "Aprobar",
    from: ["pendiente_aprobacion"],
    to: "aprobado",
    permission: "turnos.aprobar",
    requiresReason: false,
    separationOfDuties: true,
  },
  {
    key: "devolver",
    label: "Devolver con observaciones",
    from: ["pendiente_aprobacion"],
    to: "con_observaciones",
    permission: "turnos.aprobar",
    requiresReason: true,
    separationOfDuties: false,
  },
  {
    key: "publicar",
    label: "Publicar",
    from: ["aprobado"],
    to: "publicado",
    permission: "turnos.publicar",
    requiresReason: false,
    separationOfDuties: false,
  },
  {
    key: "reabrir",
    label: "Reabrir para editar",
    from: ["pendiente_aprobacion", "aprobado", "publicado"],
    to: "borrador",
    permission: "turnos.aprobar",
    requiresReason: true,
    separationOfDuties: false,
  },
  {
    key: "cancelar",
    label: "Cancelar turno",
    from: ["borrador", "con_observaciones", "pendiente_aprobacion", "aprobado", "publicado"],
    to: "cancelado",
    permission: "turnos.aprobar",
    requiresReason: true,
    separationOfDuties: false,
  },
];

/** Estados en los que se pueden cambiar horario, persona y demás datos del turno. */
export const EDITABLE_STATUSES: readonly ShiftStatus[] = ["borrador", "con_observaciones"];

export function isEditable(status: ShiftStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function findTransition(key: string): Transition | undefined {
  return TRANSITIONS.find((t) => t.key === key);
}

export function availableTransitions(status: ShiftStatus): Transition[] {
  return TRANSITIONS.filter((t) => t.from.includes(status));
}

export type TransitionCheck = { ok: true; transition: Transition } | { ok: false; message: string };

export function checkTransition(input: {
  key: string;
  status: ShiftStatus;
  reason?: string | null;
  hasPermission: (p: Permission) => boolean;
  actorId: string;
  lastEditorId: string | null;
  separationOfDuties: boolean;
}): TransitionCheck {
  const transition = findTransition(input.key);
  if (!transition) return { ok: false, message: "Acción desconocida." };
  if (!transition.from.includes(input.status)) {
    return {
      ok: false,
      message: `No se puede "${transition.label.toLowerCase()}" un turno en estado ${STATUS_LABELS[input.status].toLowerCase()}.`,
    };
  }
  if (!input.hasPermission(transition.permission)) {
    return { ok: false, message: "Tu rol no permite esta acción." };
  }
  if (transition.requiresReason && !(input.reason && input.reason.trim().length >= 5)) {
    return { ok: false, message: "Escribe el motivo (mínimo 5 caracteres). Queda registrado en la auditoría." };
  }
  if (
    transition.separationOfDuties &&
    input.separationOfDuties &&
    input.lastEditorId !== null &&
    input.lastEditorId === input.actorId
  ) {
    return {
      ok: false,
      message: "Separación de funciones: quien hizo el último cambio del turno no puede aprobarlo.",
    };
  }
  return { ok: true, transition };
}
