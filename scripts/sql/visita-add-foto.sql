-- Agrega columnas opcionales para foto de visita capturada al ingreso.
-- Ejecutar manualmente: psql -f scripts/sql/visita-add-foto.sql

ALTER TABLE public.prt_visita
  ADD COLUMN IF NOT EXISTS foto BYTEA;

ALTER TABLE public.prt_visita
  ADD COLUMN IF NOT EXISTS foto_mime_type TEXT;

COMMENT ON COLUMN public.prt_visita.foto IS 'Foto capturada al registrar el ingreso de la visita (opcional).';
COMMENT ON COLUMN public.prt_visita.foto_mime_type IS 'MIME type de la foto de visita almacenada (p. ej. image/jpeg).';
