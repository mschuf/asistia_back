-- Auditoria completa de visitas (Porteria)
-- Tabla inmutable de eventos para trazabilidad operativa y de compliance.

CREATE TABLE IF NOT EXISTS public.prt_visita_audit_log (
  id               BIGSERIAL PRIMARY KEY,
  visita_id        BIGINT NOT NULL,
  action           TEXT NOT NULL,
  actor_user_id    BIGINT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  before_state     JSONB,
  after_state      JSONB,
  changed_fields   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT chk_prt_visita_audit_log_action
    CHECK (action IN ('visita.created', 'visita.updated', 'visita.closed', 'visita.deleted'))
);

CREATE INDEX IF NOT EXISTS idx_prt_visita_audit_log_visita_occurred
  ON public.prt_visita_audit_log (visita_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_prt_visita_audit_log_actor_occurred
  ON public.prt_visita_audit_log (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_prt_visita_audit_log_action_occurred
  ON public.prt_visita_audit_log (action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_prt_visita_audit_log_occurred
  ON public.prt_visita_audit_log (occurred_at DESC);
