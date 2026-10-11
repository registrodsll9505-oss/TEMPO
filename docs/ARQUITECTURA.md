# Arquitectura de TEMPO

## Resumen

Un solo proyecto Next.js (App Router) con TypeScript estricto, organizado por módulos. PostgreSQL es la única fuente de datos. No hay microservicios: la lógica vive en capas dentro de la misma aplicación para poder crecer sin reconstruirla.

| Capa | Tecnología | Dónde |
| --- | --- | --- |
| Interfaz | React 19, Tailwind CSS 4, iconos Lucide | `src/app`, `src/components` |
| Acciones y páginas de servidor | Server Components y Server Actions de Next.js 16 | `src/app/**/page.tsx`, `actions.ts` |
| Reglas de negocio puras | TypeScript sin dependencias de servidor | `src/lib/permissions.ts`, `shift-status.ts`, `time.ts` |
| Persistencia | Drizzle ORM sobre postgres.js | `src/db`, `src/lib/queries.ts` |
| Base de datos | PostgreSQL 16, RLS, restricciones | `drizzle/*.sql` |

Las reglas puras no importan nada del servidor, por eso se prueban con pruebas unitarias rápidas y se reutilizan en el navegador (por ejemplo, para saber qué botones mostrar). La decisión real siempre se repite en el servidor.

## Varias empresas (multiempresa)

El aislamiento tiene tres barreras independientes:

1. **Aplicación.** La empresa activa se obtiene de la sesión (`getAuth`) a partir de una membresía vigente. Nunca se lee de la URL, de un formulario ni de un parámetro de la acción.
2. **Row-Level Security.** Toda consulta de negocio corre dentro de `withTenant(orgId, tx => …)`, que abre una transacción, fija `app.org_id` y ejecuta `SET LOCAL ROLE tempo_app`. Ese rol no es dueño de las tablas, así que las políticas `org_id = app_org_id()` se le aplican siempre, incluso si el servidor se conectó como superusuario.
3. **Claves foráneas compuestas.** Las relaciones entre tablas de negocio usan `(org_id, id)`. Así, aunque alguien conociera el identificador de una persona de otra empresa, la base rechaza referenciarla desde un turno propio (las comprobaciones de clave foránea no pasan por RLS, por eso hace falta esta barrera).

El rol `tempo_app` tiene privilegios mínimos:

- No puede leer `sessions`, `login_attempts` ni la columna `password_hash`.
- No puede borrar sedes, áreas, cargos, personas ni plantillas (se desactivan).
- Solo puede borrar turnos en estado `borrador`.
- En `audit_events` solo puede insertar y leer.

`systemDb` es la conexión sin aislamiento. Se usa únicamente en la capa de autenticación (usuarios y sesiones son globales, porque una persona puede pertenecer a varias empresas), en el alta de empresas y en los scripts.

### Añadir una tabla con datos de una empresa

1. Columna `org_id` y `unique (org_id, id)`.
2. Claves foráneas compuestas hacia las tablas relacionadas.
3. En la migración: `ENABLE ROW LEVEL SECURITY`, política para `tempo_app` y `GRANT` de lo estrictamente necesario.
4. Un caso en `tests/integration/aislamiento.test.ts`.

## Autenticación y sesiones

- Contraseñas con scrypt (`node:crypto`, N=2^15, r=8, p=3) y sal aleatoria. El hash guarda sus parámetros.
- Sesión: token aleatorio de 256 bits en una cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. En la base solo se guarda su SHA-256. Vence a los 30 días o tras 7 días sin uso.
- Límite de intentos: 8 fallos en 15 minutos bloquean ese correo temporalmente.
- El mensaje de error no distingue entre correo inexistente y contraseña incorrecta, y el tiempo de respuesta es equivalente.
- Usuarios invitados reciben una contraseña temporal y deben cambiarla antes de usar la aplicación; hasta entonces las acciones de servidor los rechazan.
- Un administrador no puede restablecer la contraseña de un usuario que pertenece también a otra empresa.

## Permisos

Matriz fija en `src/lib/permissions.ts` (roles configurables por empresa: fase posterior). Se comprueba en tres puntos: el menú (solo muestra lo permitido), cada página (`requirePermission`) y cada acción (`tenantAction`).

## Tiempo y zonas horarias

- Los turnos se guardan como instantes (`timestamptz`, UTC).
- Cada sede tiene una zona horaria IANA (hereda la de la empresa). Las horas que escribe el usuario se interpretan en la zona de la sede del turno.
- La duración es siempre tiempo real transcurrido. Un turno 22:00–06:00 es un solo registro; el calendario lo divide por día solo para dibujarlo (`splitByLocalDay`).
- Las plantillas guardan hora local de inicio y duración, no hora de fin, para que cruzar la medianoche no sea un caso especial.
- Colombia no tiene horario de verano, pero la lógica está probada con una zona que sí lo tiene.
- La interfaz usa un selector de hora propio de 24 horas, porque el control nativo del navegador puede mostrar a. m. / p. m. según la configuración regional.

## Turnos

- Restricción de exclusión en la base: una persona no puede tener dos turnos no cancelados que se crucen. La aplicación traduce ese error a un mensaje claro.
- Control de concurrencia optimista con `version`: si dos personas editan el mismo turno, la segunda recibe un aviso en lugar de pisar el cambio.
- Máquina de estados en `src/lib/shift-status.ts`. En esta fase están activas las transiciones enviar, aprobar, devolver, publicar, reabrir y cancelar. Los estados `pendiente_validacion`, `confirmado`, `en_ejecucion` y `ejecutado` existen en el modelo y se activarán con el motor de reglas y el control de asistencia.
- Las pausas tienen un tratamiento explícito (`remunerada`, `no_remunerada`, `por_definir`). TEMPO no descuenta pausas de ninguna cifra mientras no haya reglas verificadas: las horas que muestra son duración bruta y así se rotulan.

## Auditoría

`recordAudit` se llama dentro de la misma transacción del cambio, de modo que no existe cambio sin registro ni registro sin cambio. Guarda actor, acción, entidad, resumen legible, valores antes y después, y motivo.

## Modelo de datos (Fase 1)

`organizations`, `users`, `memberships`, `sessions`, `login_attempts`, `sites`, `areas`, `positions`, `people`, `shift_templates`, `shifts`, `audit_events`. La definición completa, con restricciones e índices, está en `src/db/schema.ts`.

## Interfaz

El lenguaje visual toma como referencia las aplicaciones de escritorio de macOS: barra lateral gris con la lista de áreas (cada una con su color, activable como los calendarios) y un calendario pequeño, control segmentado para cambiar de vista, líneas finas, y rojo para marcar el día de hoy y la hora actual. La identidad (nombre, símbolo, paleta de áreas) es propia.

Los estados no dependen solo del color: cada uno tiene icono y forma (borrador con contorno punteado, publicado con relleno pleno, vacante con trama diagonal).

En la vista de semana, los turnos con el mismo horario se agrupan en una pila con una fila por persona, porque diez turnos simultáneos repartidos en columnas no se pueden leer. La vista de día muestra cada turno como bloque independiente y permite arrastrarlo.
