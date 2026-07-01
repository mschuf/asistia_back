-- Agrega snapshots antes/despues al historial ERS (PostgreSQL)
-- Ejecutar en la base usada por asistia_back.

BEGIN;

ALTER TABLE public.ers_project_history
  ADD COLUMN IF NOT EXISTS before_state JSONB NULL,
  ADD COLUMN IF NOT EXISTS after_state JSONB NULL;

COMMIT;
