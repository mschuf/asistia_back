-- Ultimo motivo y responsable utilizados por persona en Porteria.
-- Ejecutar despues de motivo-visita.sql.

ALTER TABLE public.prt_persona
  ADD COLUMN IF NOT EXISTS ultimo_motivo BIGINT NULL
    REFERENCES public.prt_motivo_visita (id),
  ADD COLUMN IF NOT EXISTS ultimo_responsable BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_persona_ultimo_motivo
  ON public.prt_persona (ultimo_motivo);

CREATE INDEX IF NOT EXISTS idx_persona_ultimo_responsable
  ON public.prt_persona (ultimo_responsable);
