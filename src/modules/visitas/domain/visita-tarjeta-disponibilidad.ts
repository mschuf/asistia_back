/**
 * @file visita-tarjeta-disponibilidad.ts
 * @description Reglas de cuándo comprobar disponibilidad de tarjetas en visitas activas.
 */
import { isVisitaAbierta } from "./visita-estado.helpers";
import type { VisitaEstado } from "./visita-estado";

/** Indica si el estado de visita requiere comprobar disponibilidad de tarjeta. */
export function requiresTarjetaDisponibilidad(estado: VisitaEstado): boolean {
  return isVisitaAbierta(estado);
}
