/** Símbolo de TEMPO: un ciclo abierto con un punto que marca el pulso. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19.6 8.2A8.6 8.6 0 1 0 20.6 12"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path d="M12 7.4V12l3 1.9" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.4" cy="5.2" r="2.3" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark size={size} />
      <span className="font-semibold" style={{ fontSize: size * 0.72, letterSpacing: "0.16em" }}>
        TEMPO
      </span>
    </span>
  );
}
