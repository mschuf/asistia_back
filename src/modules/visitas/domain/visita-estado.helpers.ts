/**
 * @file visita-estado.helpers.ts
 * @description Helpers para estados de visita abiertas (ocupan tarjeta / persona).
 */
import type { VisitaEstado } from "./visita-estado";

/** Estados que mantienen la visita abierta (sin checkout registrado). */
export const VISITA_ESTADOS_ABIERTOS: readonly VisitaEstado[] = ["activa", "sin_salida"];

/** Indica si la visita está abierta (activa o sin salida registrada). */
export function isVisitaAbierta(estado: VisitaEstado): boolean {
  return estado === "activa" || estado === "sin_salida";
}

/** Indica si la visita puede eliminarse desde la UI. */
export function isVisitaEliminable(_estado: VisitaEstado): boolean {
  return true;
}

/** Estado destino al eliminar una visita abierta desde la UI. */
export const VISITA_ESTADO_AL_ELIMINAR_ABIERTA: VisitaEstado = "cancelada";

/** Indica si eliminar implica cancelar la visita en lugar de borrarla de la base. */
export function requiereCancelacionAlEliminar(estado: VisitaEstado): boolean {
  return isVisitaAbierta(estado);
}
