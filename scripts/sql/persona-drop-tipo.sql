-- Elimina la columna `tipo` de public.prt_persona (ya no usada por la API).
-- Ejecutar en la base PostgreSQL de Asistia.
-- Ejemplo: psql -h HOST -U USER -d asistia_back -f scripts/sql/persona-drop-tipo.sql

DROP INDEX IF EXISTS public.idx_persona_tipo;

ALTER TABLE public.prt_persona
  DROP CONSTRAINT IF EXISTS persona_tipo_check;

ALTER TABLE public.prt_persona
  DROP COLUMN IF EXISTS tipo;
