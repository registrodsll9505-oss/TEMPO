#!/usr/bin/env bash
# Se ejecuta una sola vez, al crear el entorno: instala, crea la base, siembra la demo y compila.
set -euo pipefail
cd "$(dirname "$0")/.."

# La contraseña de la demo se genera aquí y nunca se guarda en el repositorio.
if [ ! -f .env ] || ! grep -q '^DEMO_PASSWORD=.\+' .env; then
  touch .env
  sed -i '/^DEMO_PASSWORD=/d' .env
  echo "DEMO_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))")" >> .env
fi
DEMO_PASSWORD="$(grep '^DEMO_PASSWORD=' .env | cut -d= -f2-)"

npm ci
npm run db:migrate
npm run db:seed
npm run build

cat > CREDENCIALES-DEMO.md <<TXT
# TEMPO: acceso a la demostración

La aplicación se abre sola en una pestaña nueva. Si no, ve a la pestaña **Puertos** (Ports) y abre el puerto 3000.

| Correo | Contraseña | Rol |
| --- | --- | --- |
| demo@tempo.example | ${DEMO_PASSWORD} | Administrador de empresa |
| coordinacion@tempo.example | ${DEMO_PASSWORD} | Coordinador de programación |
| auditoria@tempo.example | ${DEMO_PASSWORD} | Auditor de consulta |

Todos los datos de la demostración son ficticios. Este archivo solo existe en tu entorno; git lo ignora.

Para detener o reiniciar la aplicación: \`bash .devcontainer/iniciar.sh\`
TXT
echo "Listo. Las credenciales de la demo están en CREDENCIALES-DEMO.md"
