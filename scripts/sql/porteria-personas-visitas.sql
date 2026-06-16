-- Personas y visitas para el módulo Portería (Asistia).
-- Ejecutar en la base PostgreSQL de Asistia antes de habilitar el CRUD.
-- Ejemplo: psql -h HOST -U USER -d asistia_back -f scripts/sql/porteria-personas-visitas.sql

CREATE TABLE IF NOT EXISTS public.persona (
  id              BIGSERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  documento       TEXT NOT NULL,
  empresa         TEXT,
  tipo            TEXT NOT NULL,
  email           TEXT,
  telefono        TEXT,
  glpi_user_id    BIGINT UNIQUE,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT persona_tipo_check CHECK (
    tipo IN ('cliente', 'proveedor', 'contratista', 'tecnico', 'empleado')
  )
);

CREATE INDEX IF NOT EXISTS idx_persona_nombre
  ON public.persona (nombre);

CREATE INDEX IF NOT EXISTS idx_persona_empresa
  ON public.persona (empresa);

CREATE INDEX IF NOT EXISTS idx_persona_tipo
  ON public.persona (tipo);

CREATE INDEX IF NOT EXISTS idx_persona_activo
  ON public.persona (activo);

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_documento_unique_nonempty
  ON public.persona (documento)
  WHERE documento <> '';

ALTER TABLE public.persona
  ADD COLUMN IF NOT EXISTS glpi_user_id BIGINT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_persona_glpi_user_id
  ON public.persona (glpi_user_id)
  WHERE glpi_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.visita (
  id                  BIGSERIAL PRIMARY KEY,
  persona_id          BIGINT NOT NULL REFERENCES public.persona (id),
  motivo              TEXT NOT NULL,
  responsable_nombre  TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'activa',
  estado_seguimiento  TEXT,
  zonas_permitidas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  credencial_numero   TEXT,
  tarjeta_color       TEXT,
  entrada_at          TIMESTAMPTZ,
  salida_at           TIMESTAMPTZ,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visita_estado_check CHECK (
    estado IN ('programada', 'activa', 'finalizada', 'cancelada')
  ),
  CONSTRAINT visita_estado_seguimiento_check CHECK (
    estado_seguimiento IS NULL OR estado_seguimiento IN ('activo', 'alerta', 'peligro')
  )
);

CREATE INDEX IF NOT EXISTS idx_visita_persona_id
  ON public.visita (persona_id);

CREATE INDEX IF NOT EXISTS idx_visita_estado
  ON public.visita (estado);

CREATE INDEX IF NOT EXISTS idx_visita_entrada_at
  ON public.visita (entrada_at DESC);

CREATE INDEX IF NOT EXISTS idx_visita_responsable_nombre
  ON public.visita (responsable_nombre);
