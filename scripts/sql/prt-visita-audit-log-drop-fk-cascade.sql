-- Preserva el historial de auditoría al eliminar visitas.
-- Sin este cambio, ON DELETE CASCADE borra también el evento visita.deleted.

ALTER TABLE public.prt_visita_audit_log
  DROP CONSTRAINT IF EXISTS fk_prt_visita_audit_log_visita;
