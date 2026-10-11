/** Paleta de áreas. Cada color tiene un tono pleno y uno legible sobre fondo claro u oscuro. */
export const AREA_COLORS = {
  rojo: { label: "Rojo", solid: "#E5484D", ink: "#B4232B", inkDark: "#FF9A9E" },
  naranja: { label: "Naranja", solid: "#F2882C", ink: "#A9530A", inkDark: "#FFBE85" },
  amarillo: { label: "Amarillo", solid: "#E3B00B", ink: "#7D5F00", inkDark: "#F6D766" },
  verde: { label: "Verde", solid: "#3DA35D", ink: "#1F6B38", inkDark: "#8CDBA4" },
  menta: { label: "Menta", solid: "#1FA6A0", ink: "#0E6763", inkDark: "#7FDAD5" },
  azul: { label: "Azul", solid: "#2F7DE1", ink: "#1650A3", inkDark: "#93BEFA" },
  indigo: { label: "Índigo", solid: "#6259D9", ink: "#3F37A6", inkDark: "#B1ACF7" },
  morado: { label: "Morado", solid: "#A34FCB", ink: "#73289A", inkDark: "#D9A6F2" },
  rosa: { label: "Rosa", solid: "#DE4C8A", ink: "#A31F5B", inkDark: "#F7A3C6" },
  grafito: { label: "Grafito", solid: "#7A7A80", ink: "#48484D", inkDark: "#C3C3C9" },
} as const;

export type AreaColor = keyof typeof AREA_COLORS;

export const AREA_COLOR_KEYS = Object.keys(AREA_COLORS) as AreaColor[];

export function areaColor(key: string | null | undefined) {
  return AREA_COLORS[(key as AreaColor) ?? "grafito"] ?? AREA_COLORS.grafito;
}
