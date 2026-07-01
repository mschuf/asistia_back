-- Historial ERS - Proyectos (PostgreSQL)
-- Base destino: asistia_back

BEGIN;

CREATE TABLE IF NOT EXISTS public.ers_project_history (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  action_type VARCHAR(16) NOT NULL,
  action_color VARCHAR(16) NOT NULL DEFAULT 'default',
  summary TEXT NOT NULL,
  actor_user_id BIGINT NOT NULL,
  actor_display_name VARCHAR(180) NOT NULL,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_ers_project_history_action_type
    CHECK (action_type IN ('create', 'update', 'delete')),
  CONSTRAINT ck_ers_project_history_summary_not_blank
    CHECK (length(trim(summary)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ers_project_history_project_date
  ON public.ers_project_history (project_id, happened_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ers_project_history_actor_date
  ON public.ers_project_history (actor_user_id, happened_at DESC, id DESC);

COMMIT;

