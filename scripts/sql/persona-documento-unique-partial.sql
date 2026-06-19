-- Permite varias personas con documento vacío (p. ej. vinculadas desde GLPI en visitas).
-- Ejecutar una vez en PostgreSQL de Asistia:
-- psql -h HOST -U USER -d asistia_back -f scripts/sql/persona-documento-unique-partial.sql

ALTER TABLE public.prt_persona
  DROP CONSTRAINT IF EXISTS persona_documento_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_documento_unique_nonempty
  ON public.prt_persona (documento)
  WHERE documento <> '';
