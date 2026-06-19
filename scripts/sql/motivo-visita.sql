-- Catálogo de motivos de visita para el módulo Portería (Asistia).
-- Ejecutar en la base PostgreSQL de Asistia antes de habilitar el CRUD.
-- Ejemplo: psql -h HOST -U USER -d asistia_back -f scripts/sql/motivo-visita.sql

CREATE TABLE IF NOT EXISTS public.prt_motivo_visita (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motivo_visita_nombre
  ON public.prt_motivo_visita (nombre);

CREATE INDEX IF NOT EXISTS idx_motivo_visita_activo
  ON public.prt_motivo_visita (activo);

ALTER TABLE public.prt_visita
  ADD COLUMN IF NOT EXISTS motivo_visita_id BIGINT NULL
  REFERENCES public.prt_motivo_visita (id);

CREATE INDEX IF NOT EXISTS idx_visita_motivo_visita_id
  ON public.prt_visita (motivo_visita_id);

INSERT INTO public.prt_motivo_visita (nombre)
VALUES
  ('Reparación de máquinas'),
  ('Reposición de insumos'),
  ('Mantenimiento preventivo'),
  ('Mantenimiento correctivo'),
  ('Instalación de equipos'),
  ('Inspección técnica'),
  ('Capacitación / entrenamiento'),
  ('Auditoría o certificación'),
  ('Entrega de documentación'),
  ('Reunión comercial o coordinación')
ON CONFLICT (nombre) DO NOTHING;
