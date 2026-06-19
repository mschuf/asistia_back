-- Elimina la columna de vínculo GLPI en personas (portería).
-- Ejecutar una vez en PostgreSQL de Asistia después de desplegar el backend sin referencias a glpi_user_id:
-- psql -h HOST -U USER -d asistia_back -f scripts/sql/persona-drop-glpi-user-id.sql

DROP INDEX IF EXISTS idx_persona_glpi_user_id;

ALTER TABLE public.prt_persona
  DROP COLUMN IF EXISTS glpi_user_id;
