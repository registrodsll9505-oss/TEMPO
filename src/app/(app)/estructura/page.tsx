import type { Metadata } from "next";
import { withTenant } from "@/db/client";
import { FormDialog, type Field } from "@/components/form-dialog";
import { Badge, EmptyState, PageHeader, Section, TableWrap, TD, TH, TR } from "@/components/ui";
import { requirePermission } from "@/lib/auth/context";
import { areaColor } from "@/lib/colors";
import { listAreas, listPositions, listSites } from "@/lib/queries";
import { saveArea, savePosition, saveSite } from "./actions";

export const metadata: Metadata = { title: "Estructura" };

export default async function StructurePage() {
  const auth = await requirePermission("estructura.ver");
  const canEdit = auth.can("estructura.editar");
  const { sites, areas, positions } = await withTenant(auth.org.id, async (tx) => ({
    sites: await listSites(tx),
    areas: await listAreas(tx),
    positions: await listPositions(tx),
  }));
  const siteOptions = sites.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }));

  const siteFields = (s?: (typeof sites)[number]): Field[] => [
    { name: "name", label: "Nombre", required: true, defaultValue: s?.name, half: true },
    { name: "code", label: "Código", required: true, defaultValue: s?.code, half: true, hint: "Corto y único. Ejemplo: NORTE." },
    { name: "address", label: "Dirección", defaultValue: s?.address },
    {
      name: "timezone",
      label: "Zona horaria",
      defaultValue: s?.timezone,
      placeholder: auth.org.timezone,
      hint: `Si la dejas vacía se usa la de la empresa (${auth.org.timezone}).`,
    },
    ...(s ? [{ name: "active", label: "Sede activa", type: "checkbox" as const, defaultValue: s.active }] : []),
  ];
  const areaFields = (a?: (typeof areas)[number]): Field[] => [
    { name: "siteId", label: "Sede", type: "select", required: true, options: siteOptions, defaultValue: a?.siteId ?? siteOptions[0]?.value, half: true },
    { name: "name", label: "Nombre", required: true, defaultValue: a?.name, half: true },
    { name: "color", label: "Color en el calendario", type: "color", required: true, defaultValue: a?.color ?? "azul" },
    { name: "costCenter", label: "Centro de costo", defaultValue: a?.costCenter },
    ...(a ? [{ name: "active", label: "Área activa", type: "checkbox" as const, defaultValue: a.active }] : []),
  ];
  const positionFields = (p?: (typeof positions)[number]): Field[] => [
    { name: "name", label: "Nombre", required: true, defaultValue: p?.name },
    { name: "description", label: "Descripción", type: "textarea", defaultValue: p?.description },
    ...(p ? [{ name: "active", label: "Cargo activo", type: "checkbox" as const, defaultValue: p.active }] : []),
  ];

  return (
    <>
      <PageHeader title="Estructura" description="Sedes, áreas y cargos de la empresa. Las áreas dan el color a los turnos en el calendario." />

      <Section
        title="Sedes"
        actions={canEdit ? <FormDialog title="Nueva sede" trigger={{ label: "Nueva sede", icon: "plus" }} fields={siteFields()} action={saveSite} /> : null}
      >
        {sites.length === 0 ? (
          <EmptyState title="Aún no hay sedes">Crea la primera sede para poder definir áreas y programar turnos.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Sede</th>
                  <th scope="col" className={TH}>Código</th>
                  <th scope="col" className={TH}>Dirección</th>
                  <th scope="col" className={TH}>Zona horaria</th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className={TR}>
                    <td className={`${TD} font-medium`}>{s.name}</td>
                    <td className={`${TD} tnum`}>{s.code}</td>
                    <td className={`${TD} text-ink-2`}>{s.address ?? "Sin dirección"}</td>
                    <td className={`${TD} text-ink-2`}>{s.timezone ?? `${auth.org.timezone} (empresa)`}</td>
                    <td className={TD}>{s.active ? <Badge tone="ok">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                    <td className={`${TD} text-right`}>
                      {canEdit ? (
                        <FormDialog title={`Editar ${s.name}`} trigger={{ label: `Editar ${s.name}`, icon: "edit", iconOnly: true, variant: "ghost", size: "sm" }} fields={siteFields(s)} hidden={{ id: s.id }} action={saveSite} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section
        title="Áreas"
        actions={
          canEdit && siteOptions.length > 0 ? (
            <FormDialog title="Nueva área" trigger={{ label: "Nueva área", icon: "plus" }} fields={areaFields()} action={saveArea} />
          ) : null
        }
      >
        {areas.length === 0 ? (
          <EmptyState title="Aún no hay áreas">
            {siteOptions.length === 0 ? "Primero crea una sede." : "Cada turno pertenece a un área. Ejemplos: Seguridad, Parqueadero, Mantenimiento."}
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Área</th>
                  <th scope="col" className={TH}>Sede</th>
                  <th scope="col" className={TH}>Centro de costo</th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id} className={TR}>
                    <td className={`${TD} font-medium`}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: areaColor(a.color).solid }} aria-hidden />
                        {a.name}
                      </span>
                    </td>
                    <td className={`${TD} text-ink-2`}>{a.siteName}</td>
                    <td className={`${TD} text-ink-2`}>{a.costCenter ?? "Sin definir"}</td>
                    <td className={TD}>{a.active ? <Badge tone="ok">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                    <td className={`${TD} text-right`}>
                      {canEdit ? (
                        <FormDialog title={`Editar ${a.name}`} trigger={{ label: `Editar ${a.name}`, icon: "edit", iconOnly: true, variant: "ghost", size: "sm" }} fields={areaFields(a)} hidden={{ id: a.id }} action={saveArea} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section
        title="Cargos"
        actions={canEdit ? <FormDialog title="Nuevo cargo" trigger={{ label: "Nuevo cargo", icon: "plus" }} fields={positionFields()} action={savePosition} /> : null}
      >
        {positions.length === 0 ? (
          <EmptyState title="Aún no hay cargos">Los cargos describen la función de cada persona. Ejemplos: Guarda, Auxiliar de parqueadero.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Cargo</th>
                  <th scope="col" className={TH}>Descripción</th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className={TR}>
                    <td className={`${TD} font-medium`}>{p.name}</td>
                    <td className={`${TD} text-ink-2`}>{p.description ?? "Sin descripción"}</td>
                    <td className={TD}>{p.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                    <td className={`${TD} text-right`}>
                      {canEdit ? (
                        <FormDialog title={`Editar ${p.name}`} trigger={{ label: `Editar ${p.name}`, icon: "edit", iconOnly: true, variant: "ghost", size: "sm" }} fields={positionFields(p)} hidden={{ id: p.id }} action={savePosition} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
