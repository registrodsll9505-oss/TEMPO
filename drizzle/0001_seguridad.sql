-- Seguridad y aislamiento entre empresas.
--
-- La aplicación ejecuta toda consulta de negocio dentro de una transacción que hace
-- SET LOCAL ROLE tempo_app y fija app.org_id. Ese rol no es dueño de las tablas, así que
-- las políticas de Row-Level Security se le aplican siempre, sin importar con qué usuario
-- se conectó el servidor.
--
-- Toda tabla nueva con datos de una empresa debe: llevar org_id, activar RLS, definir su
-- política y otorgar privilegios mínimos a tempo_app en su propia migración.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Una persona no puede tener dos turnos vigentes que se crucen en el tiempo.
ALTER TABLE shifts ADD CONSTRAINT shifts_person_no_overlap
  EXCLUDE USING gist (person_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (person_id IS NOT NULL AND status <> 'cancelado');
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_email_lower_ck CHECK (email = lower(email));
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tempo_app') THEN
    CREATE ROLE tempo_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT tempo_app TO CURRENT_USER;
--> statement-breakpoint
CREATE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO tempo_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON organizations TO tempo_app;
--> statement-breakpoint
GRANT SELECT (id, name, email, disabled_at, must_change_password) ON users TO tempo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON memberships, sites, areas, positions, people, shift_templates TO tempo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON shifts TO tempo_app;
--> statement-breakpoint
-- La auditoría solo admite lectura e inserción: no se puede modificar ni borrar.
GRANT SELECT, INSERT ON audit_events TO tempo_app;
--> statement-breakpoint
-- sessions y login_attempts no reciben privilegios: solo la capa de autenticación las usa.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations TO tempo_app
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sites TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON areas TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON positions TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON people TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON shift_templates TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_select ON shifts FOR SELECT TO tempo_app USING (org_id = app_org_id());
--> statement-breakpoint
CREATE POLICY tenant_insert ON shifts FOR INSERT TO tempo_app WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
CREATE POLICY tenant_update ON shifts FOR UPDATE TO tempo_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
-- Solo se pueden eliminar borradores. Cualquier otro turno se cancela y conserva su historial.
CREATE POLICY tenant_delete_drafts ON shifts FOR DELETE TO tempo_app
  USING (org_id = app_org_id() AND status = 'borrador');
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_select ON audit_events FOR SELECT TO tempo_app USING (org_id = app_org_id());
--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_events FOR INSERT TO tempo_app WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
-- Un usuario solo es visible para las empresas en las que tiene membresía.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY members_of_current_org ON users FOR SELECT TO tempo_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id));
