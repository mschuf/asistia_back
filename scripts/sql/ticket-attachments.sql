-- Adjuntos de tickets (almacenamiento propio Asistia).
-- Ejecutar en la base PostgreSQL de Asistia antes de habilitar adjuntos en producción.
-- Ejemplo: psql -h HOST -U USER -d asistia_back -f scripts/sql/ticket-attachments.sql

CREATE TABLE IF NOT EXISTS public.ticket_attachment (
  id                BIGSERIAL PRIMARY KEY,
  ticket_id         INTEGER NOT NULL,
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  uploaded_by_id    INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachment_ticket_id
  ON public.ticket_attachment (ticket_id);
