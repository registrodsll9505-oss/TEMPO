import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth/context";
import { login } from "../actions";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage() {
  if (await getAuth()) redirect("/inicio");
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Ingresa a tu empresa</h1>
      <AuthForm
        action={login}
        submitLabel="Ingresar"
        pendingLabel="Ingresando…"
        fields={[
          { name: "email", label: "Correo", type: "email", required: true, autoComplete: "username" },
          { name: "password", label: "Contraseña", type: "password", required: true, autoComplete: "current-password" },
        ]}
      />
      <p className="mt-5 text-center text-ink-2">
        ¿Tu empresa aún no usa TEMPO?{" "}
        <Link href="/registro" className="font-medium text-ink underline underline-offset-2">
          Crea una cuenta
        </Link>
      </p>
      <p className="mt-3 text-center text-[13px] text-ink-2">
        Si olvidaste tu contraseña, pide a un administrador de tu empresa que la restablezca.
      </p>
    </>
  );
}
