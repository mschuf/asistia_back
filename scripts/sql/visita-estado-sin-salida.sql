-- Agrega el estado sin_salida a visitas (ingreso de día anterior sin checkout).
-- Ejecutar en la base PostgreSQL de Asistia antes de desplegar el backend actualizado.

ALTER TABLE public.prt_visita
  DROP CONSTRAINT IF EXISTS visita_estado_check;

ALTER TABLE public.prt_visita
  ADD CONSTRAINT visita_estado_check
  CHECK (estado IN ('programada', 'activa', 'sin_salida', 'finalizada', 'cancelada'));
