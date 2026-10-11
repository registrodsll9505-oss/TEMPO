import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Modelo de datos de TEMPO, Fase 1.
 *
 * Convenciones:
 * - Toda tabla de negocio lleva org_id. El aislamiento entre empresas se aplica con
 *   Row-Level Security (ver drizzle/0001_seguridad.sql) y con claves foráneas compuestas
 *   (org_id, id), de modo que una fila nunca pueda referenciar datos de otra empresa.
 * - Los instantes se guardan como timestamptz (UTC). La zona horaria de la sede define
 *   cómo se muestran y cómo se interpretan las horas locales.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", [
  "admin_empresa",
  "director_operaciones",
  "coordinador",
  "supervisor",
  "recursos_humanos",
  "auditor",
  "empleado",
]);

export const employmentTypeEnum = pgEnum("employment_type", ["empleado_directo", "contratista"]);

export const breakTreatmentEnum = pgEnum("break_treatment", [
  "remunerada",
  "no_remunerada",
  "por_definir",
]);

export const shiftStatusEnum = pgEnum("shift_status", [
  "borrador",
  "pendiente_validacion",
  "con_observaciones",
  "pendiente_aprobacion",
  "aprobado",
  "publicado",
  "confirmado",
  "en_ejecucion",
  "ejecutado",
  "cancelado",
]);

export const organizations = pgTable("organizations", {
  id: id(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name").notNull(),
  taxId: text("tax_id"),
  country: text("country").notNull().default("CO"),
  timezone: text("timezone").notNull().default("America/Bogota"),
  currency: text("currency").notNull().default("COP"),
  /** Si es verdadero, quien edita un turno no puede aprobarlo. */
  separationOfDuties: boolean("separation_of_duties").notNull().default(true),
  /** Marca las empresas ficticias de demostración. */
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** SHA-256 del token. El token en claro solo existe en la cookie del navegador. */
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrgId: uuid("active_org_id").references(() => organizations.id, { onDelete: "set null" }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("memberships_org_user_uq").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    /** Zona horaria IANA. Si es nula, hereda la de la empresa. */
    timezone: text("timezone"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("sites_org_id_uq").on(t.orgId, t.id), unique("sites_org_code_uq").on(t.orgId, t.code)],
);

export const areas = pgTable(
  "areas",
  {
    id: id(),
    orgId: orgId(),
    siteId: uuid("site_id").notNull(),
    name: text("name").notNull(),
    /** Clave de la paleta de áreas (ver src/lib/colors.ts). */
    color: text("color").notNull().default("azul"),
    costCenter: text("cost_center"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("areas_org_id_uq").on(t.orgId, t.id),
    unique("areas_site_name_uq").on(t.siteId, t.name),
    foreignKey({
      name: "areas_site_fk",
      columns: [t.orgId, t.siteId],
      foreignColumns: [sites.orgId, sites.id],
    }),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("positions_org_id_uq").on(t.orgId, t.id), unique("positions_org_name_uq").on(t.orgId, t.name)],
);

export const people = pgTable(
  "people",
  {
    id: id(),
    orgId: orgId(),
    internalCode: text("internal_code").notNull(),
    fullName: text("full_name").notNull(),
    active: boolean("active").notNull().default(true),
    siteId: uuid("site_id"),
    areaId: uuid("area_id"),
    positionId: uuid("position_id"),
    employmentType: employmentTypeEnum("employment_type").notNull(),
    /** Empresa contratista. Solo aplica a personal de terceros. */
    providerName: text("provider_name"),
    contractType: text("contract_type"),
    /** Jornada pactada, en horas por semana. Dato contractual, no una regla legal. */
    agreedWeeklyHours: numeric("agreed_weekly_hours", { precision: 5, scale: 2 }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("people_org_id_uq").on(t.orgId, t.id),
    unique("people_org_code_uq").on(t.orgId, t.internalCode),
    foreignKey({ name: "people_site_fk", columns: [t.orgId, t.siteId], foreignColumns: [sites.orgId, sites.id] }),
    foreignKey({ name: "people_area_fk", columns: [t.orgId, t.areaId], foreignColumns: [areas.orgId, areas.id] }),
    foreignKey({
      name: "people_position_fk",
      columns: [t.orgId, t.positionId],
      foreignColumns: [positions.orgId, positions.id],
    }),
    check(
      "people_provider_ck",
      sql`${t.employmentType} = 'contratista' OR ${t.providerName} IS NULL`,
    ),
  ],
);

export const shiftTemplates = pgTable(
  "shift_templates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    /** Hora local de inicio en la sede. */
    startTime: time("start_time").notNull(),
    /** Duración total. Un turno que cruza la medianoche simplemente dura más allá de las 24:00. */
    durationMinutes: integer("duration_minutes").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    breakTreatment: breakTreatmentEnum("break_treatment").notNull().default("por_definir"),
    areaId: uuid("area_id"),
    positionId: uuid("position_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("shift_templates_org_id_uq").on(t.orgId, t.id),
    unique("shift_templates_org_code_uq").on(t.orgId, t.code),
    foreignKey({
      name: "shift_templates_area_fk",
      columns: [t.orgId, t.areaId],
      foreignColumns: [areas.orgId, areas.id],
    }),
    foreignKey({
      name: "shift_templates_position_fk",
      columns: [t.orgId, t.positionId],
      foreignColumns: [positions.orgId, positions.id],
    }),
    check("shift_templates_duration_ck", sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 1440`),
    check(
      "shift_templates_break_ck",
      sql`${t.breakMinutes} >= 0 AND ${t.breakMinutes} < ${t.durationMinutes}`,
    ),
  ],
);

export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    orgId: orgId(),
    siteId: uuid("site_id").notNull(),
    areaId: uuid("area_id").notNull(),
    /** Nulo cuando el turno está vacante. */
    personId: uuid("person_id"),
    positionId: uuid("position_id"),
    templateId: uuid("template_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    breakTreatment: breakTreatmentEnum("break_treatment").notNull().default("por_definir"),
    status: shiftStatusEnum("status").notNull().default("borrador"),
    notes: text("notes"),
    /** Control de concurrencia optimista: cada cambio incrementa la versión. */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("shifts_org_range_idx").on(t.orgId, t.startsAt, t.endsAt),
    index("shifts_person_idx").on(t.personId, t.startsAt),
    foreignKey({ name: "shifts_site_fk", columns: [t.orgId, t.siteId], foreignColumns: [sites.orgId, sites.id] }),
    foreignKey({ name: "shifts_area_fk", columns: [t.orgId, t.areaId], foreignColumns: [areas.orgId, areas.id] }),
    foreignKey({
      name: "shifts_person_fk",
      columns: [t.orgId, t.personId],
      foreignColumns: [people.orgId, people.id],
    }),
    foreignKey({
      name: "shifts_position_fk",
      columns: [t.orgId, t.positionId],
      foreignColumns: [positions.orgId, positions.id],
    }),
    foreignKey({
      name: "shifts_template_fk",
      columns: [t.orgId, t.templateId],
      foreignColumns: [shiftTemplates.orgId, shiftTemplates.id],
    }),
    // Límite técnico de integridad, no una regla laboral.
    check(
      "shifts_range_ck",
      sql`${t.endsAt} > ${t.startsAt} AND ${t.endsAt} - ${t.startsAt} <= interval '24 hours'`,
    ),
    check(
      "shifts_break_ck",
      sql`${t.breakMinutes} >= 0 AND ${t.breakMinutes} * interval '1 minute' < ${t.endsAt} - ${t.startsAt}`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    orgId: orgId(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Nombre del actor en el momento del evento. */
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ],
);


export type Role = (typeof roleEnum.enumValues)[number];
export type ShiftStatus = (typeof shiftStatusEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type BreakTreatment = (typeof breakTreatmentEnum.enumValues)[number];
