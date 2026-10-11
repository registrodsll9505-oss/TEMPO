"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { AREA_COLORS, AREA_COLOR_KEYS } from "@/lib/colors";
import { TimeField } from "./time-field";
import { buttonClass } from "./ui";

export type FieldOption = { value: string; label: string };

export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "date" | "time" | "select" | "textarea" | "checkbox" | "color";
  required?: boolean;
  options?: FieldOption[];
  defaultValue?: string | boolean | null;
  hint?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  autoComplete?: string;
  /** Muestra el campo solo cuando otro campo tiene este valor. */
  showWhen?: { field: string; equals: string };
  half?: boolean;
};

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function FormDialog(props: {
  title: string;
  description?: string;
  trigger: { label: string; variant?: "primary" | "secondary" | "ghost"; icon?: "plus" | "edit"; iconOnly?: boolean; size?: "sm" | "md" };
  fields: Field[];
  action: Action;
  hidden?: Record<string, string>;
  submitLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openCount, setOpenCount] = useState(0);
  const trigger = props.trigger;
  const Icon = trigger.icon === "plus" ? Plus : trigger.icon === "edit" ? Pencil : null;

  return (
    <>
      <button
        type="button"
        className={buttonClass(trigger.variant ?? "secondary", trigger.size ?? "md", trigger.iconOnly ? "!px-0 w-7" : "")}
        aria-label={trigger.iconOnly ? trigger.label : undefined}
        title={trigger.iconOnly ? trigger.label : undefined}
        onClick={() => {
          setOpenCount((n) => n + 1);
          ref.current?.showModal();
        }}
      >
        {Icon ? <Icon size={15} aria-hidden /> : null}
        {trigger.iconOnly ? null : trigger.label}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(560px,calc(100vw-24px))] rounded-2xl bg-raised p-0 shadow-pop backdrop:backdrop-blur-[1px]"
      >
        {openCount > 0 ? (
          <FormBody key={openCount} {...props} onClose={() => ref.current?.close()} />
        ) : null}
      </dialog>
    </>
  );
}

function FormBody(props: {
  title: string;
  description?: string;
  fields: Field[];
  action: Action;
  hidden?: Record<string, string>;
  submitLabel?: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(props.action, null);
  const [watched, setWatched] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.name, typeof f.defaultValue === "string" ? f.defaultValue : ""])),
  );
  const { onClose } = props;

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form
      // Se envía a mano para que React no vacíe el formulario cuando el servidor rechaza los datos.
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => formAction(form));
      }}
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement;
        if (target.name) setWatched((w) => ({ ...w, [target.name]: target.value }));
      }}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 className="text-[17px] font-semibold">{props.title}</h2>
          {props.description ? <p className="mt-0.5 text-ink-2">{props.description}</p> : null}
        </div>
        <button type="button" className={buttonClass("ghost", "sm", "!px-0 w-7")} onClick={onClose} aria-label="Cerrar">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 px-5 py-4">
        {Object.entries(props.hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {props.fields.map((field) => {
          if (field.showWhen && watched[field.showWhen.field] !== field.showWhen.equals) return null;
          return (
            <div key={field.name} className={field.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
              <FieldControl field={field} errors={state?.fieldErrors?.[field.name]} />
            </div>
          );
        })}
      </div>

      {state && !state.ok && state.message ? (
        <p role="alert" className="mx-5 mb-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
        <button type="button" className={buttonClass("secondary")} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={buttonClass("primary")} disabled={pending}>
          {pending ? "Guardando…" : (props.submitLabel ?? "Guardar")}
        </button>
      </div>
    </form>
  );
}

export function FieldControl({ field, errors }: { field: Field; errors?: string[] }) {
  const id = useId();
  const describedBy = errors?.length ? `${id}-e` : field.hint ? `${id}-h` : undefined;
  const common = {
    id,
    name: field.name,
    required: field.required,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": describedBy,
  } as const;
  const defaultText = typeof field.defaultValue === "string" ? field.defaultValue : undefined;

  let control: ReactNode;
  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name={field.name}
          defaultChecked={field.defaultValue === true}
          className="mt-0.5 size-4 accent-[var(--ink)]"
        />
        <span>
          <span className="font-medium">{field.label}</span>
          {field.hint ? <span className="block text-[13px] text-ink-2">{field.hint}</span> : null}
        </span>
      </label>
    );
  } else if (field.type === "select") {
    control = (
      <select {...common} defaultValue={defaultText ?? ""} className="field-input">
        {field.required ? (
          defaultText ? null : (
            <option value="" disabled>
              Selecciona…
            </option>
          )
        ) : (
          <option value="">{field.placeholder ?? "Sin asignar"}</option>
        )}
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "textarea") {
    control = <textarea {...common} defaultValue={defaultText} placeholder={field.placeholder} className="field-input" />;
  } else if (field.type === "time") {
    control = <TimeField id={id} name={field.name} label={field.label} defaultValue={defaultText} />;
  } else if (field.type === "color") {
    control = (
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2 pt-0.5">
        {AREA_COLOR_KEYS.map((key) => (
          <label key={key} className="relative cursor-pointer" title={AREA_COLORS[key].label}>
            <input
              type="radio"
              name={field.name}
              value={key}
              defaultChecked={(defaultText ?? "azul") === key}
              className="peer sr-only"
            />
            <span
              className="block size-6 rounded-full ring-offset-2 ring-offset-[var(--raised)] peer-checked:ring-2 peer-checked:ring-[var(--ink)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus)]"
              style={{ background: AREA_COLORS[key].solid }}
            />
            <span className="sr-only">{AREA_COLORS[key].label}</span>
          </label>
        ))}
      </div>
    );
  } else {
    control = (
      <input
        {...common}
        type={field.type ?? "text"}
        defaultValue={defaultText}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        step={field.step}
        autoComplete={field.autoComplete ?? "off"}
        className="field-input"
      />
    );
  }

  return (
    <div>
      <label id={`${id}-l`} htmlFor={field.type === "color" ? undefined : id} className="mb-1 block text-[13px] font-medium">
        {field.label}
        {field.required ? null : <span className="font-normal text-ink-3"> (opcional)</span>}
      </label>
      {control}
      {errors?.length ? (
        <p id={`${id}-e`} className="mt-1 text-[13px] text-danger">
          {errors.join(" ")}
        </p>
      ) : field.hint ? (
        <p id={`${id}-h`} className="mt-1 text-[13px] text-ink-2">
          {field.hint}
        </p>
      ) : null}
    </div>
  );
}
