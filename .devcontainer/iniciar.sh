#!/usr/bin/env bash
# Se ejecuta cada vez que el entorno arranca: aplica migraciones pendientes y sirve la aplicación.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d .next ] || npm run build
npm run db:migrate

# Si ya hay una instancia en el puerto 3000, se reemplaza.
if command -v fuser >/dev/null 2>&1; then fuser -k 3000/tcp >/dev/null 2>&1 || true; fi
nohup npm start > .tempo.log 2>&1 &
echo "TEMPO está arrancando en el puerto 3000 (registro en .tempo.log)."
