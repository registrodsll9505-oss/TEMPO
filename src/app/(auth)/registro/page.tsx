import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth/context";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { register } from "../actions";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  if (await getAuth()) redirect("/inicio");
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Crea la cuenta de tu empresa</h1>
      <p className="mb-4 text-ink-2">Quedarás como administrador y podrás invitar a tu equipo.</p>
      <AuthForm
        action={register}
        submitLabel="Crear cuenta"
        pendingLabel="Creando…"
        fields={[
          { name: "tradeName", label: "Nombre de la empresa", required: true, autoComplete: "organization" },
          { name: "name", label: "Tu nombre", required: true, autoComplete: "name" },
          { name: "email", label: "Correo", type: "email", required: true, autoComplete: "username" },
          {
            name: "password",
            label: "Contraseña",
            type: "password",
            required: true,
            autoComplete: "new-password",
            hint: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
          },
        ]}
      />
      <p className="mt-5 text-center text-ink-2">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-ink underline underline-offset-2">
          Ingresa
        </Link>
      </p>
    </>
  );
}
