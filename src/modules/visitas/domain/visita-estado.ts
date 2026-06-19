/**
 * @file visita-estado.ts
 * @description Estados del ciclo de vida de una visita.
 */
export const VISITA_ESTADO = [
  "programada",
  "activa",
  "sin_salida",
  "finalizada",
  "cancelada",
] as const;

export type VisitaEstado = (typeof VISITA_ESTADO)[number];
