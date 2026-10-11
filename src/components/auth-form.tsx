"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action";
import { FieldControl, type Field } from "./form-dialog";
import { buttonClass } from "./ui";

export function AuthForm(props: {
  fields: Field[];
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(props.action, null);
  return (
    <form action={formAction} className="grid gap-3.5">
      {props.fields.map((field) => (
        <FieldControl key={field.name} field={field} errors={state?.fieldErrors?.[field.name]} />
      ))}
      {state?.message ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 ${state.ok ? "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button type="submit" className={buttonClass("primary", "md", "mt-1 h-10 w-full")} disabled={pending}>
        {pending ? props.pendingLabel : props.submitLabel}
      </button>
    </form>
  );
}
