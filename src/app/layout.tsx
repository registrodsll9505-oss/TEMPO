import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TEMPO", template: "%s | TEMPO" },
  description: "Programación de turnos y gestión de personal. El tiempo, mejor organizado.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#28282b" },
  ],
};

// Aplica el tema guardado antes de pintar, para evitar un destello al cargar.
const themeScript = `try{var t=localStorage.getItem("tempo-tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
