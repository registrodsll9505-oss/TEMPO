import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:pointer-events-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-bg hover:opacity-90",
  secondary: "bg-raised text-ink border border-line-strong hover:bg-fill",
  ghost: "text-ink hover:bg-fill",
  danger: "bg-raised text-danger border border-line-strong hover:bg-fill",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md", extra = "") {
  const sizing = size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-[34px] px-3.5 text-sm";
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${sizing} ${extra}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 pt-6 pb-4 md:px-8">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 py-6 md:px-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger"; children: ReactNode }) {
  const tones = {
    neutral: "bg-fill text-ink-2",
    ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok",
    warn: "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-warn",
    danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-[56ch] text-ink-2">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="quiet-scroll overflow-x-auto rounded-xl border border-line">{children}</div>;
}

export const TH = "px-3 py-2 text-left text-xs font-medium text-ink-2 whitespace-nowrap";
export const TD = "px-3 py-2.5 align-middle";
export const TR = "border-t border-line";
