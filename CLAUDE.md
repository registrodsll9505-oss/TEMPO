# TEMPO

Plataforma SaaS de programación de turnos (mercado inicial: Colombia). Interfaz y mensajes en español de Colombia, horas en formato de 24 horas.

Antes de tocar código de Next.js lee `AGENTS.md`: esta versión (16) cambia APIs respecto a versiones anteriores.

## Comandos

- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
- `npm test`: unitarias y de aislamiento (requiere `TEST_DATABASE_URL`)
- `npm run test:e2e`: Playwright sobre el build de producción, contra la base de pruebas
- `npm run db:generate -- --name <nombre>` · `npm run db:migrate` · `npm run db:seed`

## Reglas que no se rompen

- Datos de negocio: siempre con `withTenant(orgId, tx => …)`. `systemDb` solo en autenticación, usuarios y scripts.
- La empresa activa sale de la sesión (`getAuth()`), nunca de la URL ni del formulario.
- Toda acción de servidor pasa por `tenantAction`: revalida sesión y permiso, valida con zod y audita con `recordAudit` en la misma transacción.
- Tabla nueva con datos de una empresa: `org_id`, claves foráneas compuestas `(org_id, id)`, RLS activado, política y privilegios mínimos para `tempo_app`, y un caso en `tests/integration/aislamiento.test.ts`.
- Tiempo: instantes en UTC (`timestamptz`); la conversión con hora local pasa por `src/lib/time.ts` y la zona de la sede.
- Un turno solo se edita en `borrador` o `con_observaciones`. Los cambios de estado van por `src/lib/shift-status.ts`.
- La IA y la interfaz nunca declaran legal una programación. No codifiques reglas laborales sin fuente oficial verificada (ver `docs/ESTADO.md`).
- Sin datos reales de personas en demo ni pruebas.

## Documentación

- `docs/ARQUITECTURA.md`: capas, modelo de datos y seguridad
- `docs/DECISIONES.md`: decisiones técnicas y su porqué
- `docs/ESTADO.md`: qué está hecho, qué se probó y qué falta por fase. Actualízalo al cerrar cada avance.
