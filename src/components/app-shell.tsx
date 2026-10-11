"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  FlaskConical,
  History,
  House,
  KeyRound,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Logo } from "./logo";

const ICONS = {
  inicio: House,
  calendario: CalendarDays,
  personal: Users,
  turnos: Clock,
  estructura: Building2,
  administracion: Settings,
  auditoria: History,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export type ShellUser = {
  name: string;
  email: string;
  roleLabel: string;
  orgName: string;
  isDemo: boolean;
  orgs: { id: string; tradeName: string; active: boolean }[];
};

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem("tempo-tema");
    else localStorage.setItem("tempo-tema", theme);
  } catch {
    // Sin almacenamiento local el tema sigue funcionando durante la visita.
  }
}

export function AppShell(props: {
  nav: NavItem[];
  user: ShellUser;
  logoutAction: () => Promise<void>;
  switchOrgAction: (form: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-[244px] shrink-0 flex-col border-r border-line bg-sidebar transition-transform md:static md:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[52px] items-center justify-between px-4">
          <Link href="/inicio" aria-label="TEMPO, ir al inicio">
            <Logo size={21} />
          </Link>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md hover:bg-fill md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="px-4 pb-2">
          <p className="truncate text-[13px] font-medium text-ink-2" title={props.user.orgName}>
            {props.user.orgName}
          </p>
          {props.user.isDemo ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] px-2 py-0.5 text-xs font-medium text-warn">
              <FlaskConical size={12} aria-hidden /> Datos de demostración
            </p>
          ) : null}
        </div>

        <nav aria-label="Módulos" className="px-2 pt-1">
          <ul className="grid gap-px">
            {props.nav.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium ${active ? "bg-fill-2 text-ink" : "text-ink hover:bg-fill"}`}
                  >
                    <Icon size={16} aria-hidden className={active ? "text-accent" : "text-ink-2"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* El calendario monta aquí sus filtros y el calendario pequeño. */}
        <div id="sidebar-slot" className="quiet-scroll mt-3 min-h-0 flex-1 overflow-y-auto" />

        <UserMenu user={props.user} logoutAction={props.logoutAction} switchOrgAction={props.switchOrgAction} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-sidebar px-3 md:hidden">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md hover:bg-fill"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={19} aria-hidden />
          </button>
          <Logo size={19} />
        </div>
        <main className="quiet-scroll min-h-0 flex-1 overflow-y-auto">{props.children}</main>
      </div>
    </div>
  );
}

function UserMenu(props: {
  user: ShellUser;
  logoutAction: () => Promise<void>;
  switchOrgAction: (form: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = props.user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const others = props.user.orgs.filter((o) => !o.active);
  const themes: { key: Theme; label: string; Icon: typeof Sun }[] = [
    { key: "system", label: "Sistema", Icon: Monitor },
    { key: "light", label: "Claro", Icon: Sun },
    { key: "dark", label: "Oscuro", Icon: Moon },
  ];

  return (
    <div ref={ref} className="relative border-t border-line p-2">
      {open ? (
        <div className="absolute right-2 bottom-[calc(100%-2px)] left-2 z-50 rounded-xl bg-raised p-1.5 shadow-pop">
          <div className="px-2.5 py-2">
            <p className="truncate font-medium">{props.user.name}</p>
            <p className="truncate text-[13px] text-ink-2">{props.user.email}</p>
          </div>
          <div className="mx-1 my-1 flex rounded-lg bg-fill p-0.5" role="group" aria-label="Apariencia">
            {themes.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={theme === key}
                onClick={() => {
                  setTheme(key);
                  applyTheme(key);
                }}
                className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium ${theme === key ? "bg-raised shadow-sm" : "text-ink-2"}`}
              >
                <Icon size={13} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          {others.length > 0 ? (
            <div className="mt-1 border-t border-line pt-1">
              <p className="px-2.5 py-1 text-xs text-ink-2">Cambiar de empresa</p>
              {others.map((org) => (
                <form key={org.id} action={props.switchOrgAction}>
                  <input type="hidden" name="orgId" value={org.id} />
                  <button type="submit" className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-fill">
                    <Building2 size={15} aria-hidden className="text-ink-2" />
                    <span className="truncate">{org.tradeName}</span>
                  </button>
                </form>
              ))}
            </div>
          ) : null}
          <div className="mt-1 border-t border-line pt-1">
            <Link href="/cuenta" className="flex h-8 items-center gap-2 rounded-md px-2.5 hover:bg-fill" onClick={() => setOpen(false)}>
              <KeyRound size={15} aria-hidden className="text-ink-2" />
              Mi cuenta
            </Link>
            <form action={props.logoutAction}>
              <button type="submit" className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-fill">
                <LogOut size={15} aria-hidden className="text-ink-2" />
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          const stored = document.documentElement.dataset.theme;
          setTheme(stored === "light" || stored === "dark" ? stored : "system");
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-fill"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-2 text-xs font-semibold">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{props.user.name}</span>
          <span className="block truncate text-xs text-ink-2">{props.user.roleLabel}</span>
        </span>
        <ChevronDown size={14} aria-hidden className={`text-ink-2 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}
