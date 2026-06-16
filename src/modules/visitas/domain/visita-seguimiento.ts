/**
 * @file visita-seguimiento.ts
 * @description Estados de seguimiento en tiempo real de una visita activa.
 */
export const VISITA_SEGUIMIENTO = ["activo", "alerta", "peligro"] as const;

export type VisitaSeguimiento = (typeof VISITA_SEGUIMIENTO)[number];
