/**
 * @file visita-zona.ts
 * @description Zonas físicas de la instalación para control de acceso.
 */
export const VISITA_ZONA = [
  "administración",
  "fábrica",
] as const;

export type VisitaZona = (typeof VISITA_ZONA)[number];
