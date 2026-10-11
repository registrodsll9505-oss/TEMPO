import type { Role } from "@/db/schema";

/**
 * Matriz de permisos de la Fase 1. Es fija en código; los roles configurables por empresa
 * quedan para una fase posterior. Toda comprobación real ocurre en el servidor.
 */
export const PERMISSIONS = [
  "empresa.administrar",
  "usuarios.administrar",
  "estructura.ver",
  "estructura.editar",
  "personal.ver",
  "personal.editar",
  "personal.ver_contrato",
  "plantillas.editar",
  "turnos.ver",
  "turnos.editar",
  "turnos.aprobar",
  "turnos.publicar",
  "auditoria.ver",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const LECTURA: Permission[] = ["estructura.ver", "personal.ver", "turnos.ver"];

const MATRIX: Record<Role, readonly Permission[]> = {
  admin_empresa: PERMISSIONS,
  director_operaciones: PERMISSIONS.filter((p) => p !== "empresa.administrar" && p !== "usuarios.administrar"),
  coordinador: [...LECTURA, "estructura.editar", "personal.editar", "plantillas.editar", "turnos.editar"],
  supervisor: LECTURA,
  recursos_humanos: [...LECTURA, "personal.editar", "personal.ver_contrato"],
  auditor: [...LECTURA, "personal.ver_contrato", "auditoria.ver"],
  // El portal del empleado llega en la Fase 5. Hasta entonces este rol no concede acceso.
  empleado: [],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export const ROLE_LABELS: Record<Role, string> = {
  admin_empresa: "Administrador de empresa",
  director_operaciones: "Director de operaciones",
  coordinador: "Coordinador de programación",
  supervisor: "Supervisor",
  recursos_humanos: "Recursos humanos",
  auditor: "Auditor de consulta",
  empleado: "Empleado",
};

/** Roles que se pueden asignar desde la administración en esta fase. */
export const ASSIGNABLE_ROLES: Role[] = [
  "admin_empresa",
  "director_operaciones",
  "coordinador",
  "supervisor",
  "recursos_humanos",
  "auditor",
];
