import type { Metadata } from "next";
import { Moon } from "lucide-react";
import { withTenant } from "@/db/client";
import { FormDialog, type Field } from "@/components/form-dialog";
import { Badge, EmptyState, PageHeader, TableWrap, TD, TH, TR } from "@/components/ui";
import { requirePermission } from "@/lib/auth/context";
import { listAreas, listPositions, listTemplates } from "@/lib/queries";
import { formatMinutes, minuteToTime } from "@/lib/time";
import { saveTemplate } from "./actions";

export const metadata: Metadata = { title: "Turnos" };

const BREAK_LABELS = { remunerada: "Remunerada", no_remunerada: "No remunerada", por_definir: "Por definir" } as const;

export default async function TemplatesPage() {
  const auth = await requirePermission("turnos.ver");
  const canEdit = auth.can("plantillas.editar");
  const data = await withTenant(auth.org.id, async (tx) => ({
    templates: await listTemplates(tx),
    areas: await listAreas(tx),
    positions: await listPositions(tx),
  }));
  const areaOptions = data.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.name} (${a.siteName})` }));
  const positionOptions = data.positions.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));

  const endOf = (t: { startTime: string; durationMinutes: number }) => {
    const [h, m] = t.startTime.split(":").map(Number);
    return { time: minuteToTime(h * 60 + m + t.durationMinutes), nextDay: h * 60 + m + t.durationMinutes > 1440 };
  };

  const fields = (t?: (typeof data.templates)[number]): Field[] => [
    { name: "name", label: "Nombre", required: true, defaultValue: t?.name, half: true, placeholder: "Noche" },
    { name: "code", label: "Código", required: true, defaultValue: t?.code, half: true, placeholder: "N" },
    { name: "startTime", label: "Hora de inicio", type: "time", required: true, defaultValue: t?.startTime.slice(0, 5) ?? "06:00", half: true },
    {
      name: "endTime",
      label: "Hora de fin",
      type: "time",
      required: true,
      defaultValue: t ? endOf(t).time : "14:00",
      half: true,
      hint: "Si es menor o igual al inicio, el turno termina al día siguiente.",
    },
    { name: "breakMinutes", label: "Pausa (minutos)", type: "number", required: true, min: "0", max: "600", step: "5", defaultValue: String(t?.breakMinutes ?? 0), half: true },
    {
      name: "breakTreatment",
      label: "Tratamiento de la pausa",
      type: "select",
      required: true,
      half: true,
      defaultValue: t?.breakTreatment ?? "por_definir",
      options: Object.entries(BREAK_LABELS).map(([value, label]) => ({ value, label })),
      hint: "TEMPO no descuenta la pausa hasta que definas cómo se trata.",
    },
    { name: "areaId", label: "Área sugerida", type: "select", options: areaOptions, defaultValue: t?.areaId, half: true, placeholder: "Cualquiera" },
    { name: "positionId", label: "Cargo sugerido", type: "select", options: positionOptions, defaultValue: t?.positionId, half: true, placeholder: "Cualquiera" },
    ...(t ? [{ name: "active", label: "Plantilla activa", type: "checkbox" as const, defaultValue: t.active }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Turnos"
        description="Plantillas reutilizables: defines una vez el horario y la pausa, y las aplicas al programar en el calendario."
        actions={canEdit ? <FormDialog title="Nueva plantilla de turno" trigger={{ label: "Nueva plantilla", icon: "plus", variant: "primary" }} fields={fields()} action={saveTemplate} /> : null}
      />
      <div className="px-5 py-5 md:px-8">
        {data.templates.length === 0 ? (
          <EmptyState title="Aún no hay plantillas de turno">Crea, por ejemplo, Mañana de 06:00 a 14:00, Tarde de 14:00 a 22:00 y Noche de 22:00 a 06:00.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Plantilla</th>
                  <th scope="col" className={TH}>Horario</th>
                  <th scope="col" className={TH}>Duración</th>
                  <th scope="col" className={TH}>Pausa</th>
                  <th scope="col" className={TH}>Área y cargo sugeridos</th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.templates.map((t) => {
                  const end = endOf(t);
                  return (
                    <tr key={t.id} className={TR}>
                      <td className={TD}>
                        <span className="font-medium">{t.name}</span> <span className="tnum text-ink-2">{t.code}</span>
                      </td>
                      <td className={`${TD} tnum whitespace-nowrap`}>
                        {t.startTime.slice(0, 5)} a {end.time}
                        {end.nextDay ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-[13px] text-ink-2">
                            <Moon size={12} aria-hidden /> termina al día siguiente
                          </span>
                        ) : null}
                      </td>
                      <td className={`${TD} tnum`}>{formatMinutes(t.durationMinutes)}</td>
                      <td className={`${TD} tnum`}>
                        {t.breakMinutes === 0 ? (
                          <span className="text-ink-2">Sin pausa</span>
                        ) : (
                          <>
                            {t.breakMinutes} min <span className="text-ink-2">({BREAK_LABELS[t.breakTreatment].toLowerCase()})</span>
                          </>
                        )}
                      </td>
                      <td className={`${TD} text-ink-2`}>{[t.areaName, t.positionName].filter(Boolean).join(", ") || "Cualquiera"}</td>
                      <td className={TD}>{t.active ? <Badge tone="ok">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                      <td className={`${TD} text-right`}>
                        {canEdit ? (
                          <FormDialog title={`Editar ${t.name}`} trigger={{ label: `Editar ${t.name}`, icon: "edit", iconOnly: true, variant: "ghost", size: "sm" }} fields={fields(t)} hidden={{ id: t.id }} action={saveTemplate} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
