-- Personas, proveedores y visitas para el módulo Portería (Asistia).
-- Ejecutar en la base PostgreSQL de Asistia antes de habilitar el CRUD.
-- Ejemplo: psql -h HOST -U USER -d asistia_back -f scripts/sql/porteria-personas-visitas.sql

CREATE TABLE IF NOT EXISTS public.prt_proveedor (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedor_nombre
  ON public.prt_proveedor (nombre);

CREATE INDEX IF NOT EXISTS idx_proveedor_activo
  ON public.prt_proveedor (activo);

CREATE TABLE IF NOT EXISTS public.prt_persona (
  id              BIGSERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  documento       TEXT NOT NULL,
  proveedor_id    BIGINT NOT NULL REFERENCES public.prt_proveedor (id),
  email           TEXT,
  telefono        TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_nombre
  ON public.prt_persona (nombre);

CREATE INDEX IF NOT EXISTS idx_persona_proveedor_id
  ON public.prt_persona (proveedor_id);

CREATE INDEX IF NOT EXISTS idx_persona_activo
  ON public.prt_persona (activo);

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_documento_unique_nonempty
  ON public.prt_persona (documento)
  WHERE documento <> '';

CREATE TABLE IF NOT EXISTS public.prt_visita (
  id                  BIGSERIAL PRIMARY KEY,
  persona_id          BIGINT NOT NULL REFERENCES public.prt_persona (id),
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
    estado IN ('programada', 'activa', 'sin_salida', 'finalizada', 'cancelada')
  ),
  CONSTRAINT visita_estado_seguimiento_check CHECK (
    estado_seguimiento IS NULL OR estado_seguimiento IN ('activo', 'alerta', 'peligro')
  )
);

CREATE INDEX IF NOT EXISTS idx_visita_persona_id
  ON public.prt_visita (persona_id);

CREATE INDEX IF NOT EXISTS idx_visita_estado
  ON public.prt_visita (estado);

CREATE INDEX IF NOT EXISTS idx_visita_entrada_at
  ON public.prt_visita (entrada_at DESC);

CREATE INDEX IF NOT EXISTS idx_visita_responsable_nombre
  ON public.prt_visita (responsable_nombre);
