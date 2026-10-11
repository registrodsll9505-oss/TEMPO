import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { requireAuth } from "@/lib/auth/context";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { changePassword } from "../(auth)/actions";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const auth = await requireAuth();
  return (
    <main className="flex min-h-full flex-col items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <Logo size={26} />
        </div>
        <div className="rounded-2xl bg-raised p-6 shadow-pop">
          <h1 className="text-xl font-bold">Mi cuenta</h1>
          <p className="mt-1 text-ink-2">
            {auth.user.name}, {auth.user.email}
          </p>
          {auth.user.mustChangePassword ? (
            <p className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] px-3 py-2 text-warn">
              Tu contraseña es temporal. Cámbiala para continuar.
            </p>
          ) : null}
          <h2 className="mt-5 mb-3 font-semibold">Cambiar contraseña</h2>
          <AuthForm
            action={changePassword}
            submitLabel="Cambiar contraseña"
            pendingLabel="Guardando…"
            fields={[
              { name: "current", label: "Contraseña actual", type: "password", required: true, autoComplete: "current-password" },
              {
                name: "next",
                label: "Nueva contraseña",
                type: "password",
                required: true,
                autoComplete: "new-password",
                hint: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
              },
              { name: "confirm", label: "Repite la nueva contraseña", type: "password", required: true, autoComplete: "new-password" },
            ]}
          />
        </div>
        {auth.user.mustChangePassword ? null : (
          <p className="mt-4 text-center">
            <Link href="/inicio" className="font-medium underline underline-offset-2">
              Volver a TEMPO
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
