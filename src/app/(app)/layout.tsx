import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requireAuth } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/permissions";
import { logout, switchOrg } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  if (auth.user.mustChangePassword) redirect("/cuenta");

  // El menú solo muestra lo que el rol puede usar. Cada página vuelve a comprobarlo.
  const nav: NavItem[] = [{ href: "/inicio", label: "Inicio", icon: "inicio" }];
  if (auth.can("turnos.ver")) nav.push({ href: "/calendario", label: "Calendario", icon: "calendario" });
  if (auth.can("personal.ver")) nav.push({ href: "/personal", label: "Personal", icon: "personal" });
  if (auth.can("turnos.ver")) nav.push({ href: "/turnos", label: "Turnos", icon: "turnos" });
  if (auth.can("estructura.ver")) nav.push({ href: "/estructura", label: "Estructura", icon: "estructura" });
  if (auth.can("empresa.administrar") || auth.can("usuarios.administrar")) {
    nav.push({ href: "/administracion", label: "Administración", icon: "administracion" });
  }
  if (auth.can("auditoria.ver")) nav.push({ href: "/auditoria", label: "Auditoría", icon: "auditoria" });

  return (
    <AppShell
      nav={nav}
      logoutAction={logout}
      switchOrgAction={switchOrg}
      user={{
        name: auth.user.name,
        email: auth.user.email,
        roleLabel: ROLE_LABELS[auth.role],
        orgName: auth.org.tradeName,
        isDemo: auth.org.isDemo,
        orgs: auth.orgs.map((o) => ({ id: o.id, tradeName: o.tradeName, active: o.id === auth.org.id })),
      }}
    >
      {children}
    </AppShell>
  );
}
