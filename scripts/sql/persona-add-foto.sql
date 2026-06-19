-- Agrega columnas opcionales para foto de persona almacenada como blob.
-- Ejecutar manualmente: psql -f scripts/sql/persona-add-foto.sql

ALTER TABLE public.prt_persona
  ADD COLUMN IF NOT EXISTS foto BYTEA;

ALTER TABLE public.prt_persona
  ADD COLUMN IF NOT EXISTS foto_mime_type TEXT;

COMMENT ON COLUMN public.prt_persona.foto IS 'Imagen de la persona procesada y comprimida (opcional).';
COMMENT ON COLUMN public.prt_persona.foto_mime_type IS 'MIME type de la foto almacenada (p. ej. image/jpeg).';