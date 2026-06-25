import {
  diffVisitaAuditFields,
  resolveVisitaAuditAction,
} from "./visita-audit.helpers";
import type { VisitaAuditSnapshot, VisitaListRow } from "../visitas.types";

function makeSnapshot(overrides: Partial<VisitaAuditSnapshot> = {}): VisitaAuditSnapshot {
  return {
    id: 1,
    personaId: 10,
    visitante: "Visitante Test",
    documento: "30111222",
    empresa: "Empresa Test",
    motivo: "Reunión",
    responsableNombre: "Responsable",
    estado: "activa",
    estadoSeguimiento: "activo",
    zonasPermitidas: ["administración"],
    credencialNumero: "T-1",
    tarjetaColor: "rojo",
    entradaAt: "2026-06-18T12:00:00.000Z",
    salidaAt: null,
    observaciones: null,
    createdAt: "2026-06-18T12:00:00.000Z",
    updatedAt: "2026-06-18T12:00:00.000Z",
    ...overrides,
  };
}

function makeRow(overrides: Partial<VisitaListRow> = {}): VisitaListRow {
  return {
    id: "1",
    persona_id: "10",
    motivo: "Reunión",
    responsable_nombre: "Responsable",
    estado: "activa",
    estado_seguimiento: "activo",
    zonas_permitidas: ["administración"],
    credencial_numero: "T-1",
    tarjeta_color: "rojo",
    entrada_at: "2026-06-18T12:00:00.000Z",
    salida_at: null,
    observaciones: null,
    created_at: "2026-06-18T12:00:00.000Z",
    updated_at: "2026-06-18T12:00:00.000Z",
    visitante: "Visitante Test",
    documento: "30111222",
    empresa: "Empresa Test",
    has_foto: false,
    has_visita_foto: false,
    ...overrides,
  };
}

describe("visita-audit.helpers", () => {
  describe("diffVisitaAuditFields", () => {
    it("devuelve todos los campos cuando no hay estado previo", () => {
      const after = makeSnapshot();
      const result = diffVisitaAuditFields(null, after);
      expect(result).toContain("estado");
      expect(result).toContain("visitante");
      expect(result.length).toBeGreaterThan(5);
    });

    it("detecta solo campos modificados", () => {
      const before = makeSnapshot();
      const after = makeSnapshot({ estado: "finalizada", salidaAt: "2026-06-18T14:00:00.000Z" });
      const result = diffVisitaAuditFields(before, after);
      expect(result).toEqual(expect.arrayContaining(["estado", "salidaAt"]));
      expect(result).not.toContain("visitante");
    });

    it("devuelve todos los campos cuando se elimina la visita", () => {
      const before = makeSnapshot();
      const result = diffVisitaAuditFields(before, null);
      expect(result).toContain("estado");
      expect(result).toContain("visitante");
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe("resolveVisitaAuditAction", () => {
    it("marca visita.closed cuando pasa a finalizada", () => {
      const current = makeRow({ estado: "activa", salida_at: null });
      const updated = makeRow({ estado: "finalizada", salida_at: "2026-06-18T14:00:00.000Z" });
      const result = resolveVisitaAuditAction(current, updated, "visita.updated");
      expect(result).toBe("visita.closed");
    });

    it("marca visita.closed aunque la visita activa ya tenga salida planificada", () => {
      const current = makeRow({
        estado: "activa",
        salida_at: "2026-06-18T18:00:00.000Z",
      });
      const updated = makeRow({
        estado: "finalizada",
        salida_at: "2026-06-18T14:00:00.000Z",
      });
      const result = resolveVisitaAuditAction(current, updated, "visita.updated");
      expect(result).toBe("visita.closed");
    });

    it("mantiene fallback cuando no implica cierre", () => {
      const current = makeRow({ estado: "activa", observaciones: null });
      const updated = makeRow({ estado: "activa", observaciones: "Actualizado" });
      const result = resolveVisitaAuditAction(current, updated, "visita.updated");
      expect(result).toBe("visita.updated");
    });
  });
});
