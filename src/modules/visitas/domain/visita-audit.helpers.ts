/**
 * @file visita-audit.helpers.ts
 * @description Utilidades puras para calcular diffs y clasificar acciones de auditoría.
 */
import type {
  VisitaAuditAction,
  VisitaAuditSnapshot,
  VisitaListRow,
} from "../visitas.types";

/**
 * Calcula campos modificados entre dos snapshots serializables.
 * @param beforeSnapshot - Estado previo.
 * @param afterSnapshot - Estado posterior.
 * @returns Lista de claves que cambiaron.
 */
export function diffVisitaAuditFields(
  beforeSnapshot: VisitaAuditSnapshot | null,
  afterSnapshot: VisitaAuditSnapshot | null,
): string[] {
  if (!beforeSnapshot && afterSnapshot) {
    return Object.keys(afterSnapshot);
  }
  if (beforeSnapshot && !afterSnapshot) {
    return Object.keys(beforeSnapshot);
  }
  if (!beforeSnapshot || !afterSnapshot) return [];
  return Object.keys(afterSnapshot).filter((key) => {
    const typedKey = key as keyof VisitaAuditSnapshot;
    return JSON.stringify(beforeSnapshot[typedKey]) !== JSON.stringify(afterSnapshot[typedKey]);
  });
}

/**
 * Determina si una actualización corresponde a cierre de visita.
 * @param current - Estado actual antes del update.
 * @param updated - Estado posterior del update.
 * @param fallback - Acción por defecto.
 * @returns Acción final para el evento de auditoría.
 */
export function resolveVisitaAuditAction(
  current: VisitaListRow | null,
  updated: VisitaListRow | null,
  fallback: VisitaAuditAction,
): VisitaAuditAction {
  if (!current || !updated) return fallback;
  const wasFinalizada = current.estado === "finalizada";
  const isFinalizada = updated.estado === "finalizada";
  if (!wasFinalizada && isFinalizada) {
    return "visita.closed";
  }
  return fallback;
}
