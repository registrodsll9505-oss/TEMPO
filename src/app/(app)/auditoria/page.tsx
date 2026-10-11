import type { Metadata } from "next";
import { withTenant } from "@/db/client";
import { EmptyState, PageHeader, TableWrap, TD, TH, TR } from "@/components/ui";
import { requirePermission } from "@/lib/auth/context";
import { listAudit } from "@/lib/queries";
import { toZoned } from "@/lib/time";

export const metadata: Metadata = { title: "Auditoría" };

const ENTITY_LABELS: Record<string, string> = {
  turno: "Turnos",
  persona: "Personal",
  plantilla: "Plantillas",
  sede: "Sedes",
  area: "Áreas",
  cargo: "Cargos",
  usuario: "Usuarios",
  empresa: "Empresa",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const auth = await requirePermission("auditoria.ver");
  const params = await searchParams;
  const tipo = params.tipo && ENTITY_LABELS[params.tipo] ? params.tipo : undefined;
  const events = await withTenant(auth.org.id, (tx) => listAudit(tx, { limit: 200, entityType: tipo }));

  return (
    <>
      <PageHeader title="Auditoría" description="Registro de cambios: quién hizo qué y cuándo. No se puede editar ni borrar." />
      <div className="px-5 py-5 md:px-8">
        <form className="mb-4 flex items-end gap-2">
          <div>
            <label htmlFor="tipo" className="mb-1 block text-[13px] font-medium">
              Tipo de registro
            </label>
            <select id="tipo" name="tipo" defaultValue={tipo ?? ""} className="field-input">
              <option value="">Todos</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="h-[34px] rounded-[7px] border border-line-strong bg-raised px-3.5 font-medium hover:bg-fill">
            Filtrar
          </button>
        </form>
        {events.length === 0 ? (
          <EmptyState title="Sin eventos para este filtro" />
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Fecha y hora</th>
                    <th scope="col" className={TH}>Quién</th>
                    <th scope="col" className={TH}>Qué cambió</th>
                    <th scope="col" className={TH}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className={TR}>
                      <td className={`${TD} tnum whitespace-nowrap text-ink-2`}>{toZoned(e.createdAt, auth.org.timezone).toFormat("d LLL yyyy, HH:mm")}</td>
                      <td className={`${TD} whitespace-nowrap`}>{e.actorName}</td>
                      <td className={TD}>
                        {e.summary}
                        <span className="ml-2 text-[13px] text-ink-3">{e.action}</span>
                      </td>
                      <td className={`${TD} text-ink-2`}>{e.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-2 text-[13px] text-ink-2">
              Se muestran los {events.length} eventos más recientes. Horas en {auth.org.timezone}.
            </p>
          </>
        )}
      </div>
    </>
  );
}
