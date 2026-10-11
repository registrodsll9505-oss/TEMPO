import { describe, expect, it } from "vitest";
import type { Role, ShiftStatus } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ASSIGNABLE_ROLES, can, PERMISSIONS, permissionsOf, type Permission } from "@/lib/permissions";
import { availableTransitions, checkTransition, isEditable, TRANSITIONS } from "@/lib/shift-status";
import { layoutDay } from "@/components/calendar/util";

describe("matriz de permisos", () => {
  it("el administrador de empresa lo puede todo", () => {
    for (const p of PERMISSIONS) expect(can("admin_empresa", p)).toBe(true);
  });

  it("solo el administrador gestiona empresa y usuarios", () => {
    const others: Role[] = ["director_operaciones", "coordinador", "supervisor", "recursos_humanos", "auditor", "empleado"];
    for (const role of others) {
      expect(can(role, "empresa.administrar")).toBe(false);
      expect(can(role, "usuarios.administrar")).toBe(false);
    }
  });

  it("el coordinador programa pero no aprueba ni publica", () => {
    expect(can("coordinador", "turnos.editar")).toBe(true);
    expect(can("coordinador", "turnos.aprobar")).toBe(false);
    expect(can("coordinador", "turnos.publicar")).toBe(false);
  });

  it("supervisor y auditor son de solo lectura", () => {
    const writes: Permission[] = ["estructura.editar", "personal.editar", "plantillas.editar", "turnos.editar", "turnos.aprobar", "turnos.publicar"];
    for (const p of writes) {
      expect(can("supervisor", p)).toBe(false);
      expect(can("auditor", p)).toBe(false);
    }
    expect(can("auditor", "auditoria.ver")).toBe(true);
    expect(can("supervisor", "auditoria.ver")).toBe(false);
  });

  it("los datos contractuales solo los ven RR. HH., auditoría, dirección y administración", () => {
    expect(can("coordinador", "personal.ver_contrato")).toBe(false);
    expect(can("supervisor", "personal.ver_contrato")).toBe(false);
    expect(can("recursos_humanos", "personal.ver_contrato")).toBe(true);
  });

  it("el rol empleado no concede acceso en esta fase ni se puede asignar", () => {
    expect(permissionsOf("empleado")).toHaveLength(0);
    expect(ASSIGNABLE_ROLES).not.toContain("empleado");
  });
});

describe("flujo de estados del turno", () => {
  const base = { actorId: "u1", lastEditorId: "u2", separationOfDuties: true, hasPermission: () => true };

  it("solo borrador y con observaciones son editables", () => {
    const editable: ShiftStatus[] = ["borrador", "con_observaciones"];
    const all: ShiftStatus[] = ["borrador", "pendiente_validacion", "con_observaciones", "pendiente_aprobacion", "aprobado", "publicado", "confirmado", "en_ejecucion", "ejecutado", "cancelado"];
    for (const status of all) expect(isEditable(status)).toBe(editable.includes(status));
  });

  it("sigue el camino borrador, pendiente, aprobado, publicado", () => {
    expect(checkTransition({ ...base, key: "enviar", status: "borrador" })).toMatchObject({ ok: true });
    expect(checkTransition({ ...base, key: "aprobar", status: "pendiente_aprobacion" })).toMatchObject({ ok: true });
    expect(checkTransition({ ...base, key: "publicar", status: "aprobado" })).toMatchObject({ ok: true });
  });

  it("no permite saltarse pasos", () => {
    expect(checkTransition({ ...base, key: "aprobar", status: "borrador" }).ok).toBe(false);
    expect(checkTransition({ ...base, key: "publicar", status: "borrador" }).ok).toBe(false);
    expect(checkTransition({ ...base, key: "publicar", status: "pendiente_aprobacion" }).ok).toBe(false);
    expect(checkTransition({ ...base, key: "enviar", status: "publicado" }).ok).toBe(false);
  });

  it("un turno cancelado es terminal", () => {
    expect(availableTransitions("cancelado")).toHaveLength(0);
    for (const t of TRANSITIONS) expect(checkTransition({ ...base, key: t.key, status: "cancelado", reason: "motivo válido" }).ok).toBe(false);
  });

  it("reabrir, devolver y cancelar exigen motivo", () => {
    for (const [key, status] of [["reabrir", "publicado"], ["devolver", "pendiente_aprobacion"], ["cancelar", "aprobado"]] as const) {
      expect(checkTransition({ ...base, key, status }).ok).toBe(false);
      expect(checkTransition({ ...base, key, status, reason: "   " }).ok).toBe(false);
      expect(checkTransition({ ...base, key, status, reason: "abc" }).ok).toBe(false);
      expect(checkTransition({ ...base, key, status, reason: "Cambio de persona" }).ok).toBe(true);
    }
  });

  it("respeta el permiso de cada transición", () => {
    const onlyEdit = (p: Permission) => p === "turnos.editar";
    expect(checkTransition({ ...base, hasPermission: onlyEdit, key: "enviar", status: "borrador" }).ok).toBe(true);
    expect(checkTransition({ ...base, hasPermission: onlyEdit, key: "aprobar", status: "pendiente_aprobacion" }).ok).toBe(false);
    expect(checkTransition({ ...base, hasPermission: onlyEdit, key: "publicar", status: "aprobado" }).ok).toBe(false);
  });

  it("separación de funciones: quien editó no aprueba", () => {
    const self = { ...base, actorId: "u1", lastEditorId: "u1" };
    expect(checkTransition({ ...self, key: "aprobar", status: "pendiente_aprobacion" }).ok).toBe(false);
    expect(checkTransition({ ...self, separationOfDuties: false, key: "aprobar", status: "pendiente_aprobacion" }).ok).toBe(true);
    // No aplica a las demás transiciones.
    expect(checkTransition({ ...self, key: "enviar", status: "borrador" }).ok).toBe(true);
  });

  it("rechaza acciones desconocidas", () => {
    expect(checkTransition({ ...base, key: "inventada", status: "borrador" }).ok).toBe(false);
  });
});

describe("contraseñas", () => {
  it("verifica la correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("una-clave-larga-1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("una-clave-larga-1");
    expect(await verifyPassword("una-clave-larga-1", hash)).toBe(true);
    expect(await verifyPassword("una-clave-larga-2", hash)).toBe(false);
  });

  it("cada hash usa una sal distinta", async () => {
    expect(await hashPassword("misma-clave-123")).not.toBe(await hashPassword("misma-clave-123"));
  });

  it("un hash mal formado nunca valida", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$3$sal$hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("distribución de turnos solapados en columnas", () => {
  const seg = (startMinute: number, endMinute: number) => ({ segment: { date: "2026-10-11", startMinute, endMinute, isStart: true, isEnd: true } });

  it("turnos consecutivos comparten columna", () => {
    const placed = layoutDay([seg(360, 840), seg(840, 1320)]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([[0, 1], [0, 1]]);
  });

  it("turnos simultáneos se reparten", () => {
    const placed = layoutDay([seg(360, 840), seg(360, 840), seg(480, 1020)]);
    expect(placed.map((p) => p.column).sort()).toEqual([0, 1, 2]);
    expect(placed.every((p) => p.columns === 3)).toBe(true);
  });

  it("reutiliza una columna libre dentro del mismo grupo", () => {
    const placed = layoutDay([seg(0, 600), seg(0, 300), seg(300, 600)]);
    expect(placed.map((p) => [p.segment.startMinute, p.column])).toEqual([[0, 0], [0, 1], [300, 1]]);
    expect(placed.every((p) => p.columns === 2)).toBe(true);
  });
});
