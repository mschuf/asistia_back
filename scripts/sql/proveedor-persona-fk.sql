-- Proveedores y FK en personas (portería).
-- Ejecutar después de persona-drop-glpi-user-id.sql si aplica:
-- psql -h HOST -U USER -d asistia_back -f scripts/sql/proveedor-persona-fk.sql

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

-- Migrar empresas distintas existentes
INSERT INTO public.prt_proveedor (nombre)
SELECT DISTINCT TRIM(empresa)
FROM public.prt_persona
WHERE empresa IS NOT NULL
  AND TRIM(empresa) <> ''
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE public.prt_persona
  ADD COLUMN IF NOT EXISTS proveedor_id BIGINT REFERENCES public.prt_proveedor (id);

UPDATE public.prt_persona p
SET proveedor_id = pr.id
FROM public.prt_proveedor pr
WHERE p.proveedor_id IS NULL
  AND p.empresa IS NOT NULL
  AND TRIM(p.empresa) <> ''
  AND TRIM(p.empresa) = pr.nombre;

-- Placeholder para personas sin empresa asignada
INSERT INTO public.prt_proveedor (nombre)
VALUES ('Sin asignar')
ON CONFLICT (nombre) DO NOTHING;

UPDATE public.prt_persona p
SET proveedor_id = pr.id
FROM public.prt_proveedor pr
WHERE p.proveedor_id IS NULL
  AND pr.nombre = 'Sin asignar';

ALTER TABLE public.prt_persona
  ALTER COLUMN proveedor_id SET NOT NULL;

DROP INDEX IF EXISTS idx_persona_empresa;

ALTER TABLE public.prt_persona
  DROP COLUMN IF EXISTS empresa;

CREATE INDEX IF NOT EXISTS idx_persona_proveedor_id
  ON public.prt_persona (proveedor_id);
