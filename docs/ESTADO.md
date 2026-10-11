# Estado del proyecto

Última actualización: 11 de octubre de 2026. Fase en curso: **Fase 1, base funcional**.

**TEMPO no está listo para producción.** Faltan la validación jurídica, la recuperación de cuenta por correo, las copias de seguridad, el monitoreo y un despliegue probado. La lista completa está abajo.

## Fase 1: qué está implementado

| Entregable de la fase | Estado | Notas |
| --- | --- | --- |
| Identidad visual | Hecho | Símbolo, logotipo, favicon, paleta de áreas, modo claro y oscuro |
| Autenticación | Hecho, con pendientes | Registro, ingreso, cierre de sesión, cambio de contraseña, límite de intentos. Falta recuperación por correo |
| Multiempresa | Hecho | Aislamiento en aplicación y en base de datos; un usuario puede pertenecer a varias empresas y cambiar entre ellas |
| Roles y permisos | Hecho, con pendientes | Seis roles con matriz fija por módulo. Faltan roles configurables y permisos por sede |
| Sedes y áreas | Hecho | También cargos; zona horaria por sede; color por área |
| Personal | Hecho | Empleados directos y contratistas diferenciados; datos contractuales restringidos |
| Turnos | Hecho | Plantillas reutilizables con pausa y su tratamiento; turnos que cruzan la medianoche |
| Calendario | Hecho, con pendientes | Vistas día, semana, mes, equipo y lista; crear, editar, mover, redimensionar, copiar semana, filtrar por sede y área, buscar |
| Flujo de estados | Hecho | Enviar, aprobar, devolver, publicar, reabrir y cancelar, con motivo y separación de funciones |
| Persistencia real | Hecho | PostgreSQL con migraciones versionadas |
| Auditoría | Hecho | Registro inmutable por transacción; historial dentro de cada turno |
| Datos de demostración | Hecho | Empresa ficticia marcada como demo: 2 sedes, 7 áreas, 18 personas, 280 turnos en tres semanas |

## Qué se probó

Ejecutado el 11 de octubre de 2026 en Node 22 y PostgreSQL 16.

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Sin errores |
| `npm run typecheck` | Sin errores |
| `npm test` (Vitest) | 56 pruebas aprobadas |
| `npm run test:e2e` (Playwright, Chromium, sobre el build de producción) | 7 pruebas aprobadas |
| `npm run build` | Compila |

**Pruebas unitarias (36).** Conversión entre hora local e instante; turnos que cruzan la medianoche; turno que termina a las 00:00; comportamiento con cambio de horario en una zona que lo tiene; rangos de cada vista; matriz de permisos; máquina de estados (camino normal, saltos prohibidos, estado terminal, motivos obligatorios, separación de funciones); contraseñas; reparto de turnos solapados en columnas.

**Pruebas de integración contra PostgreSQL (20).** Cada empresa ve solo sus filas en todas las tablas; no se puede insertar, actualizar, borrar ni mover filas hacia otra empresa; un turno propio no puede referenciar persona, área o sede ajenas; el rol de la aplicación no lee contraseñas ni sesiones; sin empresa fijada no se ve nada; el contexto no se filtra entre transacciones; la auditoría no se puede alterar; solo se borran borradores; una persona no puede tener turnos cruzados (incluido el turno nocturno contra la madrugada siguiente); turnos consecutivos y vacantes simultáneos sí se permiten; duración y pausas inválidas se rechazan.

**Pruebas de extremo a extremo (7).**

1. Sin sesión se redirige al ingreso; credenciales incorrectas se rechazan.
2. Una empresa nueva crea sede, área, cargo, persona y plantilla nocturna; programa un turno 22:00–06:00 que se dibuja en dos días y persiste al recargar; un código repetido se rechaza sin perder lo escrito; un turno cruzado para la misma persona se rechaza; todo queda en auditoría.
3. Otra empresa no ve datos de la demo aunque ponga en la URL el identificador de una sede ajena.
4. El coordinador crea y envía; no puede aprobar. El administrador aprueba y publica; el turno publicado queda bloqueado; reabrir exige motivo; el historial lo muestra todo; quien edita no puede aprobar su propio cambio.
5. El auditor no ve administración ni botones de edición y es redirigido si entra por URL.
6. Arrastrar un borrador cambia su horario; copiar semana crea borradores en la siguiente.
7. Un usuario invitado debe cambiar su contraseña temporal antes de entrar; la temporal deja de servir; tras ocho fallos el correo se bloquea.

Las pruebas de extremo a extremo fallaron una vez en doce ejecuciones, en el flujo de aprobación, y no se conservó el detalle. La causa probable era abrir un turno en el instante entre guardar y recibir los datos actualizados. Se corrigió bloqueando el calendario durante ese instante y recargando el editor si el turno cambia; después hubo seis ejecuciones seguidas sin fallos.

**Revisión visual.** Capturas de todas las pantallas en escritorio (claro y oscuro) y de la vista de día en móvil, revisadas a mano.

### Lo que no se probó

- Cambio de rol, desactivación de usuarios y restablecimiento de contraseña por un administrador (implementados, sin prueba automática).
- Cambio de empresa para un usuario con varias membresías.
- Redimensionar un turno arrastrando su borde; interacciones de la vista de mes.
- Navegadores distintos de Chromium; dispositivos reales; lectores de pantalla.
- Rendimiento con volúmenes grandes. No hay objetivos medidos ni pruebas de carga.
- Sedes en zonas horarias distintas a la de la empresa dentro del calendario (la lógica de tiempo sí está probada en unidad).
- Despliegue real en Vercel y Neon. Se ensayó en local lo que ese despliegue necesita: las migraciones y las 56 pruebas con un dueño de base de datos sin superusuario, con `CREATEROLE` y `BYPASSRLS` (como en un PostgreSQL administrado), el comando de compilación con migración y siembra, el registro cerrado, y las 7 pruebas de extremo a extremo sin sentencias preparadas. No se pudo probar contra el agrupador de conexiones de Neon ni en la plataforma de Vercel.
- El entorno de GitHub Codespaces en GitHub mismo. Se ensayaron en local sus dos scripts sobre una copia limpia del repositorio (instalar, migrar, sembrar, compilar y arrancar) y el reenvío de puertos con un proxy simulado; la creación real del Codespace no se pudo ejecutar desde el entorno de desarrollo.

## Limitaciones conocidas

**Seguridad y cuentas**

- No hay recuperación de contraseña por correo ni verificación del correo al registrarse: requieren un servicio de envío que aún no está conectado. Mientras tanto, un administrador restablece contraseñas.
- El registro es abierto por defecto y no tiene límite por dirección IP ni captcha. Se puede cerrar con `REGISTRO_ABIERTO=false`. El límite de intentos de ingreso es por correo, no por IP.
- No hay verificación en dos pasos ni inicio de sesión corporativo.
- No se envía cabecera Content-Security-Policy.
- No existe el rol de administrador de plataforma (soporte entre empresas).
- No hay políticas de conservación y eliminación de datos ni proceso de gestión de incidentes. El cumplimiento de la Ley 1581 de 2012 no ha sido verificado.
- `npm audit`: las dependencias de producción no reportan vulnerabilidades. Las de desarrollo reportan 9 avisos (4 moderados, 5 altos) en herramientas que no se despliegan (cadena de ESLint y drizzle-kit).

**Normativa y costos**

- **No se valida ninguna regla laboral.** Aprobar un turno registra una revisión humana, no un cumplimiento. La interfaz lo indica.
- No se calculan horas efectivas, recargos ni costos. Las "horas" que se muestran son duración bruta de los turnos.
- Los datos de la demo son ilustrativos y no han sido revisados contra la jornada legal.

**Calendario**

- No hay vistas separadas por área, sede, cargo ni cobertura por franjas; se resuelve con filtros.
- Arrastrar funciona con ratón. En pantallas táctiles se edita desde el formulario.
- En la vista de semana no se arrastran los turnos agrupados en pila; sí en la de día.
- No hay deshacer, intercambio de turnos, patrones de rotación ni repetición. Sí hay copiar semana.
- Aprobar y publicar es turno por turno; falta la acción por lotes.

**Operación**

- La única forma de usarla sin instalar es GitHub Codespaces, que es un entorno personal de prueba: se apaga a los 30 minutos sin actividad y sus datos se pierden si se elimina.
- Sin copias de seguridad, monitoreo, registro centralizado de errores ni entornos separados.

## Pendiente por fase

**Fase 2. Programación asistida.** Disponibilidad y ausencias; requisitos de cobertura por franja; motor de validación inicial con niveles de alerta; propuestas de programación; detección de conflictos más allá del solape; aprobación y publicación por lotes; rotaciones.

**Fase 3. Normativa y costos.** Registro versionado de reglas con fuente oficial; motor determinista con pruebas; estimación de horas y costos; simulador presupuestal; centro de actualización normativa.

Antes de escribir una sola regla hay que verificar en fuentes oficiales (Diario Oficial, SUIN-Juriscol, Ministerio del Trabajo) y con revisión jurídica, entre otros: la jornada máxima vigente según la Ley 2101 de 2021, el inicio del trabajo nocturno según la Ley 2466 de 2025, y el calendario y los porcentajes del recargo por trabajo en día de descanso obligatorio. Ninguno de esos valores está codificado hoy.

**Fase 4. Optimización avanzada.** Motor de optimización por restricciones en segundo plano; comparación de escenarios; simulador de cambios; equidad; reemplazos sugeridos; planificación por demanda.

**Fase 5. Gestión operativa integral.** Portal del empleado; asistencia y conciliación; contratos de proveedores; notificaciones; reportes y exportación; importación desde CSV y Excel; API documentada.

**Fase 6. Preparación comercial.** Recuperación de cuenta por correo; verificación en dos pasos; roles configurables; monitoreo; copias y restauración probadas; pruebas de carga; despliegue; planes de suscripción.
