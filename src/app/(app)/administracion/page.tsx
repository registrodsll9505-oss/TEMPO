import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { organizations } from "@/db/schema";
import { FormDialog, type Field } from "@/components/form-dialog";
import { Badge, PageHeader, Section, TableWrap, TD, TH, TR } from "@/components/ui";
import { requireAuth } from "@/lib/auth/context";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { listMembers } from "@/lib/queries";
import { inviteMember, resetMemberPassword, saveOrganization, updateMember } from "./actions";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminPage() {
  const auth = await requireAuth();
  const canOrg = auth.can("empresa.administrar");
  const canUsers = auth.can("usuarios.administrar");
  if (!canOrg && !canUsers) redirect("/inicio?sin_permiso=1");

  const { org, members } = await withTenant(auth.org.id, async (tx) => ({
    org: (await tx.select().from(organizations).where(eq(organizations.id, auth.org.id)))[0],
    members: canUsers ? await listMembers(tx) : [],
  }));

  const roleOptions = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const orgFields: Field[] = [
    { name: "tradeName", label: "Nombre comercial", required: true, defaultValue: org.tradeName, half: true },
    { name: "legalName", label: "Razón social", required: true, defaultValue: org.legalName, half: true },
    { name: "taxId", label: "NIT", defaultValue: org.taxId, half: true },
    { name: "timezone", label: "Zona horaria", required: true, defaultValue: org.timezone, half: true },
    {
      name: "separationOfDuties",
      label: "Exigir separación de funciones",
      type: "checkbox",
      defaultValue: org.separationOfDuties,
      hint: "Quien hizo el último cambio de un turno no puede aprobarlo.",
    },
  ];
  const tempPassword: Field = {
    name: "password",
    label: "Contraseña temporal",
    type: "password",
    required: true,
    autoComplete: "new-password",
    hint: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. La persona deberá cambiarla al ingresar.`,
  };

  return (
    <>
      <PageHeader title="Administración" description="Datos de la empresa y personas con acceso a TEMPO." />

      {canOrg ? (
        <Section
          title="Empresa"
          actions={<FormDialog title="Datos de la empresa" trigger={{ label: "Editar", icon: "edit" }} fields={orgFields} action={saveOrganization} />}
        >
          <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              ["Nombre comercial", org.tradeName],
              ["Razón social", org.legalName],
              ["NIT", org.taxId ?? "Sin registrar"],
              ["País y moneda", `${org.country}, ${org.currency}`],
              ["Zona horaria", org.timezone],
              ["Separación de funciones", org.separationOfDuties ? "Exigida para aprobar turnos" : "No exigida"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[13px] text-ink-2">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {canUsers ? (
        <Section
          title="Usuarios y roles"
          actions={
            <FormDialog
              title="Agregar usuario"
              description="Si el correo ya tiene cuenta en TEMPO, se suma a esta empresa y conserva su contraseña."
              trigger={{ label: "Agregar usuario", icon: "plus" }}
              submitLabel="Agregar"
              fields={[
                { name: "name", label: "Nombre", required: true, half: true },
                { name: "email", label: "Correo", type: "email", required: true, half: true },
                { name: "role", label: "Rol", type: "select", required: true, options: roleOptions, defaultValue: "coordinador" },
                tempPassword,
              ]}
              action={inviteMember}
            />
          }
        >
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Usuario</th>
                  <th scope="col" className={TH}>Rol</th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const self = m.userId === auth.user.id;
                  return (
                    <tr key={m.membershipId} className={TR}>
                      <td className={TD}>
                        <span className="block font-medium">
                          {m.name}
                          {self ? <span className="font-normal text-ink-2"> (tú)</span> : null}
                        </span>
                        <span className="text-[13px] text-ink-2">{m.email}</span>
                      </td>
                      <td className={TD}>{ROLE_LABELS[m.role]}</td>
                      <td className={TD}>
                        {!m.active ? <Badge>Inactivo</Badge> : m.mustChangePassword ? <Badge tone="warn">Contraseña temporal</Badge> : <Badge tone="ok">Activo</Badge>}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {self ? null : (
                          <span className="inline-flex gap-1">
                            <FormDialog
                              title={`Acceso de ${m.name}`}
                              trigger={{ label: "Cambiar rol", variant: "ghost", size: "sm" }}
                              hidden={{ membershipId: m.membershipId }}
                              fields={[
                                { name: "role", label: "Rol", type: "select", required: true, options: roleOptions, defaultValue: m.role },
                                { name: "active", label: "Acceso activo", type: "checkbox", defaultValue: m.active, hint: "Al desactivarlo se cierran sus sesiones en esta empresa." },
                              ]}
                              action={updateMember}
                            />
                            <FormDialog
                              title={`Restablecer contraseña de ${m.name}`}
                              trigger={{ label: "Restablecer contraseña", variant: "ghost", size: "sm" }}
                              submitLabel="Restablecer"
                              hidden={{ membershipId: m.membershipId }}
                              fields={[tempPassword]}
                              action={resetMemberPassword}
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      ) : null}
    </>
  );
}
