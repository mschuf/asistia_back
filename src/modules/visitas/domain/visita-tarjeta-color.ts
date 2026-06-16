/**
 * @file visita-tarjeta-color.ts
 * @description Colores de tarjeta de visita y mapeo a zonas permitidas.
 */
import type { VisitaZona } from "./visita-zona";

export const VISITA_TARJETA_COLOR = ["rojo", "amarillo", "verde"] as const;

export type VisitaTarjetaColor = (typeof VISITA_TARJETA_COLOR)[number];

/** Indica si un valor es un color de tarjeta válido. */
export function isVisitaTarjetaColor(value: unknown): value is VisitaTarjetaColor {
  return typeof value === "string" && (VISITA_TARJETA_COLOR as readonly string[]).includes(value);
}

/** Resuelve las zonas permitidas según el color de tarjeta seleccionado. */
export function resolveZonasFromTarjetaColor(color: VisitaTarjetaColor): VisitaZona[] {
  switch (color) {
    case "rojo":
      return ["administración"];
    case "amarillo":
      return ["fábrica"];
    case "verde":
      return ["administración", "fábrica"];
  }
}

function zonasAreEqual(a: VisitaZona[], b: VisitaZona[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((zona, index) => zona === sortedB[index]);
}

/** Valida que las zonas coincidan con el color de tarjeta. */
export function zonasMatchTarjetaColor(color: VisitaTarjetaColor, zonas: VisitaZona[]): boolean {
  return zonasAreEqual(zonas, resolveZonasFromTarjetaColor(color));
}
