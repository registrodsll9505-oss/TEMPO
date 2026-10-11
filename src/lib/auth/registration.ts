/**
 * El registro de empresas nuevas se puede cerrar con REGISTRO_ABIERTO=false.
 * Útil en una instalación pública que ya tiene su empresa creada.
 */
export function isRegistrationOpen(): boolean {
  return (process.env.REGISTRO_ABIERTO ?? "true").trim().toLowerCase() !== "false";
}
