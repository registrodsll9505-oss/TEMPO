import type { NextConfig } from "next";

// Decisión D-03: Cache Components y el prefetch parcial quedan desactivados.
// Todas las pantallas dependen de la sesión y de la empresa activa; se prefiere
// renderizado dinámico por petición antes que arriesgar datos de una empresa en caché.
// En GitHub Codespaces la aplicación se sirve detrás del reenvío de puertos de GitHub.
// Se autoriza únicamente la dirección pública de este entorno para las acciones de servidor.
const codespaceHost =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(codespaceHost ? { experimental: { serverActions: { allowedOrigins: [codespaceHost] } } } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
