import type { Metadata } from "next";
import { withTenant } from "@/db/client";
import { FormDialog, type Field } from "@/components/form-dialog";
import { Badge, EmptyState, PageHeader, TableWrap, TD, TH, TR } from "@/components/ui";
import { requirePermission } from "@/lib/auth/context";
import { areaColor } from "@/lib/colors";
import { listAreas, listPeople, listPositions, listSites } from "@/lib/queries";
import { savePerson } from "./actions";

export const metadata: Metadata = { title: "Personal" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const auth = await requirePermission("personal.ver");
  const canEdit = auth.can("personal.editar");
  const canSeeContract = auth.can("personal.ver_contrato");
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const tipo = params.tipo === "empleado_directo" || params.tipo === "contratista" ? params.tipo : "";

  const data = await withTenant(auth.org.id, async (tx) => ({
    people: await listPeople(tx),
    sites: await listSites(tx),
    areas: await listAreas(tx),
    positions: await listPositions(tx),
  }));

  const people = data.people.filter(
    (p) =>
      (!tipo || p.employmentType === tipo) &&
      (!q || p.fullName.toLowerCase().includes(q) || p.internalCode.toLowerCase().includes(q)),
  );
  const siteOptions = data.sites.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }));
  const areaOptions = data.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.name} (${a.siteName})` }));
  const positionOptions = data.positions.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));

  const fields = (p?: (typeof people)[number]): Field[] => [
    { name: "fullName", label: "Nombre completo", required: true, defaultValue: p?.fullName },
    { name: "internalCode", label: "Código interno", required: true, defaultValue: p?.internalCode, half: true, hint: "Identificador de la empresa, no el documento." },
    {
      name: "employmentType",
      label: "Vinculación",
      type: "select",
      required: true,
      half: true,
      defaultValue: p?.employmentType ?? "empleado_directo",
      options: [
        { value: "empleado_directo", label: "Empleado directo" },
        { value: "contratista", label: "Contratista o tercero" },
      ],
    },
    {
      name: "providerName",
      label: "Empresa contratista",
      required: true,
      defaultValue: p?.providerName,
      showWhen: { field: "employmentType", equals: "contratista" },
      hint: "El personal de terceros no se trata como empleado: sus condiciones salen del contrato de servicios.",
    },
    { name: "siteId", label: "Sede", type: "select", options: siteOptions, defaultValue: p?.siteId, half: true },
    { name: "areaId", label: "Área", type: "select", options: areaOptions, defaultValue: p?.areaId, half: true },
    { name: "positionId", label: "Cargo", type: "select", options: positionOptions, defaultValue: p?.positionId },
    ...(canSeeContract
      ? ([
          { name: "contractType", label: "Tipo de contrato", defaultValue: p?.contractType, half: true, placeholder: "Término indefinido" },
          {
            name: "agreedWeeklyHours",
            label: "Jornada pactada (h/semana)",
            defaultValue: p?.agreedWeeklyHours,
            half: true,
            hint: "Dato del contrato. No valida la jornada legal.",
          },
          { name: "startDate", label: "Fecha de ingreso", type: "date", defaultValue: p?.startDate, half: true },
          { name: "endDate", label: "Fecha de finalización", type: "date", defaultValue: p?.endDate, half: true },
          { name: "notes", label: "Observaciones", type: "textarea", defaultValue: p?.notes, hint: "No registres datos de salud ni otra información sensible." },
        ] satisfies Field[])
      : []),
    ...(p ? [{ name: "active", label: "Persona activa", type: "checkbox" as const, defaultValue: p.active, hint: "Las personas inactivas no se pueden asignar a turnos nuevos." }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Personal"
        description="Empleados directos y personal de contratistas, registrados por separado."
        actions={canEdit ? <FormDialog title="Nueva persona" trigger={{ label: "Nueva persona", icon: "plus", variant: "primary" }} fields={fields()} action={savePerson} /> : null}
      />
      <div className="px-5 py-5 md:px-8">
        <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
          <div className="min-w-[220px] flex-1 sm:max-w-xs">
            <label htmlFor="q" className="mb-1 block text-[13px] font-medium">
              Buscar
            </label>
            <input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Nombre o código" className="field-input" />
          </div>
          <div>
            <label htmlFor="tipo" className="mb-1 block text-[13px] font-medium">
              Vinculación
            </label>
            <select id="tipo" name="tipo" defaultValue={tipo} className="field-input">
              <option value="">Todas</option>
              <option value="empleado_directo">Empleados directos</option>
              <option value="contratista">Contratistas</option>
            </select>
          </div>
          <button type="submit" className="h-[34px] rounded-[7px] border border-line-strong bg-raised px-3.5 font-medium hover:bg-fill">
            Filtrar
          </button>
        </form>

        {data.people.length === 0 ? (
          <EmptyState title="Aún no hay personas registradas">
            Registra a tu equipo para poder asignarle turnos. Conviene crear antes las sedes, áreas y cargos en Estructura.
          </EmptyState>
        ) : people.length === 0 ? (
          <EmptyState title="Ninguna persona coincide con el filtro">Cambia la búsqueda o quita el filtro de vinculación.</EmptyState>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-ink-2">
              {people.length} de {data.people.length} personas
            </p>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Persona</th>
                    <th scope="col" className={TH}>Vinculación</th>
                    <th scope="col" className={TH}>Cargo</th>
                    <th scope="col" className={TH}>Área</th>
                    <th scope="col" className={TH}>Sede</th>
                    {canSeeContract ? <th scope="col" className={TH}>Jornada pactada</th> : null}
                    <th scope="col" className={TH}>Estado</th>
                    <th scope="col" className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className={TR}>
                      <td className={TD}>
                        <span className="block font-medium">{p.fullName}</span>
                        <span className="tnum text-[13px] text-ink-2">{p.internalCode}</span>
                      </td>
                      <td className={TD}>
                        {p.employmentType === "contratista" ? (
                          <>
                            <span className="block">Contratista</span>
                            <span className="text-[13px] text-ink-2">{p.providerName}</span>
                          </>
                        ) : (
                          "Empleado directo"
                        )}
                      </td>
                      <td className={`${TD} text-ink-2`}>{p.positionName ?? "Sin cargo"}</td>
                      <td className={TD}>
                        {p.areaName ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ background: areaColor(p.areaColor).solid }} aria-hidden />
                            {p.areaName}
                          </span>
                        ) : (
                          <span className="text-ink-2">Sin área</span>
                        )}
                      </td>
                      <td className={`${TD} text-ink-2`}>{p.siteName ?? "Sin sede"}</td>
                      {canSeeContract ? (
                        <td className={`${TD} tnum text-ink-2`}>{p.agreedWeeklyHours ? `${Number(p.agreedWeeklyHours)} h` : "Sin dato"}</td>
                      ) : null}
                      <td className={TD}>{p.active ? <Badge tone="ok">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                      <td className={`${TD} text-right`}>
                        {canEdit ? (
                          <FormDialog title={`Editar a ${p.fullName}`} trigger={{ label: `Editar a ${p.fullName}`, icon: "edit", iconOnly: true, variant: "ghost", size: "sm" }} fields={fields(p)} hidden={{ id: p.id }} action={savePerson} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </div>
    </>
  );
}
