import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";
const ADMIN = "demo@tempo.example";
const COORDINATOR = "coordinacion@tempo.example";
const AUDITOR = "auditoria@tempo.example";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/inicio");
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

const dialog = (page: Page) => page.locator("dialog[open]");
// Next añade su propio anunciador de rutas con role="alert"; se excluye.
const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test("exige sesión y rechaza credenciales incorrectas", async ({ page }) => {
  await page.goto("/calendario");
  await expect(page).toHaveURL(/\/ingresar$/);

  await page.getByLabel("Correo").fill(ADMIN);
  await page.getByLabel("Contraseña").fill("clave-equivocada-1");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(alertOf(page)).toContainText("Correo o contraseña incorrectos.");

  await login(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Administración");
  await expect(page.getByText("Datos de demostración")).toBeVisible();
});

test("una empresa nueva configura su estructura y programa un turno nocturno", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Nombre de la empresa").fill("Ferretería Prueba");
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Correo").fill("ana@ferreteria.example");
  await page.getByLabel("Contraseña").fill("clave-de-prueba-1");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/inicio");
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeVisible();

  // Estructura
  await page.goto("/estructura");
  await page.getByRole("button", { name: "Nueva sede" }).click();
  await dialog(page).getByLabel("Nombre").fill("Local Centro");
  await dialog(page).getByLabel("Código").fill("centro");
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("cell", { name: "Local Centro", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "CENTRO", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Nueva área" }).click();
  await dialog(page).getByLabel("Nombre").fill("Mostrador");
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("cell", { name: "Mostrador", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Nuevo cargo" }).click();
  await dialog(page).getByLabel("Nombre").fill("Vendedor");
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("cell", { name: "Vendedor", exact: true })).toBeVisible();

  // Un código de sede repetido se rechaza con un mensaje claro.
  await page.getByRole("button", { name: "Nueva sede" }).click();
  await dialog(page).getByLabel("Nombre").fill("Otra");
  await dialog(page).getByLabel("Código").fill("CENTRO");
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Ya existe un registro");
  // Lo escrito no se pierde cuando el servidor rechaza el formulario.
  await expect(dialog(page).getByLabel("Nombre")).toHaveValue("Otra");
  await dialog(page).getByRole("button", { name: "Cancelar" }).click();

  // Personal: un contratista exige empresa contratista.
  await page.goto("/personal");
  await page.getByRole("button", { name: "Nueva persona" }).click();
  await dialog(page).getByLabel("Nombre completo").fill("Luis Prueba Gómez");
  await dialog(page).getByLabel("Código interno").fill("v-01");
  await dialog(page).getByLabel("Vinculación").selectOption("contratista");
  await expect(dialog(page).getByLabel("Empresa contratista")).toBeVisible();
  await dialog(page).getByLabel("Vinculación").selectOption("empleado_directo");
  await expect(dialog(page).getByLabel("Empresa contratista")).toHaveCount(0);
  await dialog(page).getByLabel("Área").selectOption({ label: "Mostrador (Local Centro)" });
  await dialog(page).getByLabel("Cargo").selectOption({ label: "Vendedor" });
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Luis Prueba Gómez")).toBeVisible();

  // Plantilla nocturna
  await page.goto("/turnos");
  await page.getByRole("button", { name: "Nueva plantilla" }).click();
  await dialog(page).getByLabel("Nombre").fill("Noche");
  await dialog(page).getByLabel("Código").fill("N");
  await dialog(page).getByLabel("Hora de inicio: hora").selectOption("22");
  await dialog(page).getByLabel("Hora de fin: hora").selectOption("06");
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("termina al día siguiente", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "8 h", exact: true })).toBeVisible();

  // Calendario: turno que cruza la medianoche
  await page.goto("/calendario?vista=semana&fecha=2026-11-04");
  await page.getByRole("button", { name: "Nuevo turno" }).click();
  await dialog(page).getByLabel("Plantilla").selectOption({ label: "Noche (22:00, 8 h)" });
  await dialog(page).getByLabel("Persona").selectOption({ label: "Luis Prueba Gómez" });
  await expect(dialog(page).getByText("Termina al día siguiente")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Crear turno" }).click();
  await expect(page.getByRole("status")).toContainText("Turno creado como borrador.");
  // Se dibuja en dos días: de 22:00 a 24:00 y de 00:00 a 06:00.
  await expect(page.locator("[data-shift]")).toHaveCount(2);

  // Persiste tras recargar.
  await page.reload();
  await expect(page.locator("[data-shift]")).toHaveCount(2);

  // La misma persona no puede tener un turno que se cruce.
  await page.goto("/calendario?vista=dia&fecha=2026-11-05");
  await page.getByRole("button", { name: "Nuevo turno" }).click();
  await dialog(page).getByLabel("Persona").selectOption({ label: "Luis Prueba Gómez" });
  await dialog(page).getByLabel("Inicio: hora").selectOption("05");
  await dialog(page).getByLabel("Fin: hora").selectOption("09");
  await dialog(page).getByRole("button", { name: "Crear turno" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("ya tiene otro turno que se cruza");
  await dialog(page).getByRole("button", { name: "Cancelar" }).click();

  // Auditoría
  await page.goto("/auditoria");
  await expect(page.getByText("Se creó el turno: Luis Prueba Gómez")).toBeVisible();
  await expect(page.getByText("Se creó la sede Local Centro.")).toBeVisible();
});

test("una empresa no puede ver datos de otra aunque manipule la URL", async ({ page }) => {
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
  const [demoSite] = await sql<{ id: string }[]>`select s.id from sites s join organizations o on o.id = s.org_id where o.is_demo limit 1`;
  await sql.end();

  await login(page, "ana@ferreteria.example", "clave-de-prueba-1");
  const monday = new Date().toISOString().slice(0, 10);
  await page.goto(`/calendario?vista=lista&fecha=${monday}&sede=${demoSite.id}`);
  await expect(page.getByText("No hay turnos en esta semana")).toBeVisible();
  await expect(page.getByLabel("Sede")).toHaveValue("");
  await expect(page.getByText("Camilo Ibáñez")).toHaveCount(0);

  await page.goto("/personal");
  await expect(page.getByText("1 de 1 personas")).toBeVisible();
  await expect(page.getByText("Camilo Ibáñez Roa")).toHaveCount(0);
});

test("flujo de aprobación con separación de funciones y bloqueo de turnos publicados", async ({ page }) => {
  // El coordinador crea y envía a aprobación.
  await login(page, COORDINATOR);
  await page.goto("/calendario?vista=lista&fecha=2026-11-10");
  await page.getByRole("button", { name: "Nuevo turno" }).click();
  await dialog(page).getByLabel("Sede").selectOption({ label: "Sede Principal" });
  await dialog(page).getByLabel("Área").selectOption({ label: "Mantenimiento" });
  await dialog(page).getByLabel("Persona").selectOption({ label: "Hernán Fajardo Illera" });
  await dialog(page).getByLabel("Notas").fill("Revisión de planta eléctrica");
  await dialog(page).getByRole("button", { name: "Crear turno" }).click();
  await expect(page.getByRole("status")).toContainText("Turno creado");

  const row = page.locator("tr[data-shift]", { hasText: "Hernán Fajardo Illera" });
  await row.click();
  await expect(dialog(page).getByText("Borrador")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Enviar a aprobación" }).click();
  await expect(page.getByRole("status")).toContainText("Estado del turno actualizado.");

  await row.click();
  await expect(dialog(page).getByText("Pendiente de aprobación", { exact: true })).toBeVisible();
  // Su rol no aprueba ni puede seguir editando.
  await expect(dialog(page).getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(dialog(page).getByLabel("Notas")).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Cerrar" }).last().click();
  await logout(page);

  // El administrador aprueba y publica.
  await login(page, ADMIN);
  await page.goto("/calendario?vista=lista&fecha=2026-11-10");
  await row.click();
  await dialog(page).getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("status")).toContainText("Estado del turno actualizado.");
  await row.click();
  await dialog(page).getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("status")).toContainText("Estado del turno actualizado.");

  // Publicado: no se edita ni se elimina; reabrir exige motivo.
  await row.click();
  await expect(dialog(page).getByText("Este turno está publicado.")).toBeVisible();
  await expect(dialog(page).getByLabel("Persona")).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Eliminar" })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Reabrir para editar" }).click();
  const confirm = dialog(page).getByRole("button", { name: "Reabrir para editar" }).last();
  await expect(confirm).toBeDisabled();
  await dialog(page).getByLabel("Motivo").fill("Cambio de alcance del trabajo");
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("Estado del turno actualizado.");

  // El historial conserva todo el recorrido, con el motivo.
  await row.click();
  await dialog(page).getByText("Historial de cambios").click();
  const history = dialog(page).locator("details");
  await expect(history).toContainText("Coordinación Demo");
  await expect(history).toContainText("Pendiente de aprobación → Aprobado");
  await expect(history).toContainText("Publicado → Borrador");
  await expect(history).toContainText("Motivo: Cambio de alcance del trabajo");

  // Separación de funciones: quien edita no aprueba su propio cambio.
  await dialog(page).getByLabel("Notas").fill("Revisión de planta eléctrica y tableros");
  await dialog(page).getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("status")).toContainText("Turno guardado.");
  await row.click();
  await dialog(page).getByRole("button", { name: "Enviar a aprobación" }).click();
  await expect(page.getByRole("status")).toContainText("Estado del turno actualizado.");
  await row.click();
  await expect(dialog(page).getByRole("button", { name: "Aprobar" })).toBeDisabled();
  await expect(dialog(page).getByText("No puedes aprobar este turno porque hiciste su último cambio.")).toBeVisible();
});

test("el auditor consulta pero no modifica ni administra", async ({ page }) => {
  await login(page, AUDITOR);
  const nav = page.getByRole("navigation", { name: "Módulos" });
  await expect(nav.getByRole("link", { name: "Auditoría" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Administración" })).toHaveCount(0);

  await page.goto("/administracion");
  await expect(page).toHaveURL(/\/inicio\?sin_permiso=1$/);
  await expect(alertOf(page)).toContainText("Tu rol no tiene acceso a esa sección.");

  await page.goto("/calendario?vista=equipo");
  await expect(page.getByRole("button", { name: "Nuevo turno" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copiar semana" })).toHaveCount(0);
  await page.locator("[data-shift]").first().click();
  await expect(dialog(page).getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  await expect(dialog(page).getByLabel("Persona")).toBeDisabled();

  await page.goto("/personal");
  await expect(page.getByRole("button", { name: "Nueva persona" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Jornada pactada" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "42 h", exact: true }).first()).toBeVisible();
});

test("arrastrar un borrador cambia su horario y copiar semana crea borradores", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/calendario?vista=dia&fecha=2026-11-17");
  await page.getByRole("button", { name: "Nuevo turno" }).click();
  await dialog(page).getByLabel("Persona").selectOption({ label: "Diana Realpe Muñoz" });
  await dialog(page).getByLabel("Inicio: hora").selectOption("08");
  await dialog(page).getByLabel("Fin: hora").selectOption("10");
  await dialog(page).getByRole("button", { name: "Crear turno" }).click();
  await expect(page.getByRole("status")).toContainText("Turno creado");

  const block = page.locator("button[data-shift]");
  await expect(block).toHaveCount(1);
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 20 + 48, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + 20 + 96, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toContainText("Turno movido a martes 17, 10:00.");
  await expect(block).toContainText("10:00–12:00");

  // Copiar la semana a la siguiente.
  await page.goto("/calendario?vista=lista&fecha=2026-11-17");
  await page.getByRole("button", { name: "Copiar semana" }).click();
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 turno copiado como borrador");
  await expect(page).toHaveURL(/fecha=2026-11-24/);
  await expect(page.locator("tr[data-shift]", { hasText: "Diana Realpe Muñoz" })).toContainText("10:00–12:00");
});

test("un usuario invitado debe cambiar su contraseña temporal, y los intentos fallidos se limitan", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/administracion");
  await page.getByRole("button", { name: "Agregar usuario" }).click();
  await dialog(page).getByLabel("Nombre").fill("Sara Supervisora");
  await dialog(page).getByLabel("Correo").fill("sara@tempo.example");
  await dialog(page).getByLabel("Rol").selectOption({ label: "Supervisor" });
  await dialog(page).getByLabel("Contraseña temporal").fill("temporal-12345");
  await dialog(page).getByRole("button", { name: "Agregar" }).click();
  const saraRow = page.locator("tr", { hasText: "sara@tempo.example" });
  await expect(saraRow).toContainText("Contraseña temporal");
  await expect(saraRow).toContainText("Supervisor");

  // El administrador no puede quitarse su propio acceso desde la lista.
  await expect(page.locator("tr", { hasText: "demo@tempo.example" }).getByRole("button")).toHaveCount(0);
  await logout(page);

  // Primer ingreso: se le obliga a cambiar la contraseña antes de entrar.
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill("sara@tempo.example");
  await page.getByLabel("Contraseña").fill("temporal-12345");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/cuenta");
  await expect(page.getByText("Tu contraseña es temporal.")).toBeVisible();
  await page.goto("/calendario");
  await expect(page).toHaveURL(/\/cuenta$/);

  await page.getByLabel("Contraseña actual").fill("temporal-12345");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("definitiva-67890");
  await page.getByLabel("Repite la nueva contraseña").fill("definitiva-67890");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Contraseña actualizada.");

  // Ya entra, con el menú de su rol: consulta el calendario pero no programa.
  await page.goto("/calendario");
  await expect(page).toHaveURL(/\/calendario$/);
  await expect(page.getByRole("button", { name: "Nuevo turno" })).toHaveCount(0);
  await logout(page);

  // La contraseña temporal dejó de servir.
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill("sara@tempo.example");
  await page.getByLabel("Contraseña").fill("temporal-12345");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(alertOf(page)).toContainText("Correo o contraseña incorrectos.");

  // Tras varios fallos seguidos el correo queda bloqueado temporalmente.
  await page.getByLabel("Correo").fill("nadie@tempo.example");
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.getByLabel("Contraseña").fill(`clave-incorrecta-${attempt}`);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  }
  await page.getByLabel("Contraseña").fill("otra-clave-incorrecta");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(alertOf(page)).toContainText("Demasiados intentos fallidos.");
});
