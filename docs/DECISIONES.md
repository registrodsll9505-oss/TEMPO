# Decisiones técnicas

Cada decisión indica qué se eligió, por qué y qué se descartó.

**D-01. Un solo proyecto Next.js modular, sin microservicios.**
Menos piezas que operar y un solo despliegue. Las reglas de negocio están en módulos puros, así que se podrán extraer a un servicio si algún día hace falta (por ejemplo, el optimizador).

**D-02. PostgreSQL con Drizzle ORM.**
Drizzle genera las migraciones desde el esquema tipado y deja escribir SQL a mano donde importa (RLS, restricciones de exclusión). Las migraciones son archivos SQL versionados y legibles.

**D-03. Sin Cache Components de Next.js.**
La plantilla de Next 16 lo activa por defecto. Se desactivó porque todas las pantallas dependen de la sesión y de la empresa activa: se prefiere renderizado por petición antes que arriesgar que un dato de una empresa quede en una caché compartida. Se puede adoptar por ruta más adelante.

**D-04. Aislamiento por RLS con cambio de rol por transacción.**
`SET LOCAL ROLE tempo_app` hace que las políticas apliquen sin depender de con qué usuario se conecta el servidor. Alternativa descartada: un esquema o una base por empresa, que complica migraciones y reportes.

**D-05. Claves foráneas compuestas `(org_id, id)`.**
RLS no protege las comprobaciones de clave foránea. Las claves compuestas cierran ese hueco en la propia base.

**D-06. Autenticación propia y pequeña, en lugar de una librería.**
Sesiones opacas guardadas en la base y scrypt de `node:crypto`, sin dependencias externas. Se prefirió porque el flujo necesario es corto (correo y contraseña, sesiones revocables, varias empresas por usuario) y así cada pieza queda a la vista y cubierta por pruebas. La capa está aislada en `src/lib/auth` para poder sustituirla por una librería o un proveedor de identidad cuando se añada inicio de sesión corporativo (SSO) o verificación en dos pasos.

**D-07. Instantes en UTC y zona horaria por sede.**
Evita errores con turnos nocturnos y permite operar en varios países. Ver `docs/ARQUITECTURA.md`.

**D-08. Solapes de una misma persona prohibidos en la base de datos.**
Es una incompatibilidad física, no una regla laboral, así que se impone con una restricción de exclusión y no puede saltarse por un error de la aplicación.

**D-09. Ninguna regla laboral codificada en la Fase 1.**
El modelo guarda jornada pactada y tratamiento de pausas como datos, pero la aplicación no valida jornadas máximas, recargos ni descansos. La interfaz lo dice de forma explícita al aprobar. Las reglas se implementarán en la Fase 3, versionadas y con fuente oficial verificada.

**D-10. Matriz de permisos fija en código.**
Suficiente para esta fase y fácil de probar. Los roles configurables por empresa quedan para una fase posterior; el rol `empleado` existe pero no concede acceso hasta que exista el portal.

**D-11. Los registros maestros no se borran, se desactivan.**
Sedes, áreas, cargos, personas y plantillas conservan su historia. Los turnos solo se eliminan en borrador; después se cancelan con motivo.

**D-12. Tipografía del sistema.**
Sin fuentes externas: carga inmediata, ningún tercero recibe peticiones de los usuarios y la aplicación se ve nativa en cada dispositivo.

**D-13. Selector de hora propio de 24 horas.**
El control nativo `<input type="time">` sigue la configuración regional del navegador y en `es-CO` puede mostrar a. m. / p. m.

**D-14. Formularios enviados por código, no con el atributo `action`.**
React vacía los formularios tras una acción. Enviándolos a mano se conserva lo que el usuario escribió cuando el servidor rechaza los datos.

**D-15. Vista de semana agrupada por horario.**
Ver la sección de interfaz en `docs/ARQUITECTURA.md`.

**D-16. Entorno de GitHub Codespaces en modo producción.**
El Codespace compila y sirve con `next start` en lugar del servidor de desarrollo: arranca más rápido, se comporta como un despliegue real y evita las restricciones de origen del modo desarrollo detrás del reenvío de puertos. La contraseña de la demo se genera al crear el entorno y queda en un archivo ignorado por git. Para las acciones de servidor se autoriza solo la dirección pública de ese Codespace.
