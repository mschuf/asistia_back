import {
  isVisitaAbierta,
  requiereCancelacionAlEliminar,
  VISITA_ESTADOS_ABIERTOS,
} from "./visita-estado.helpers";

describe("visita-estado.helpers", () => {
  describe("isVisitaAbierta", () => {
    it("devuelve true para activa y sin_salida", () => {
      expect(isVisitaAbierta("activa")).toBe(true);
      expect(isVisitaAbierta("sin_salida")).toBe(true);
    });

    it("devuelve false para estados cerrados o programados", () => {
      expect(isVisitaAbierta("programada")).toBe(false);
      expect(isVisitaAbierta("finalizada")).toBe(false);
      expect(isVisitaAbierta("cancelada")).toBe(false);
    });
  });

  it("VISITA_ESTADOS_ABIERTOS incluye activa y sin_salida", () => {
    expect(VISITA_ESTADOS_ABIERTOS).toEqual(["activa", "sin_salida"]);
  });

  describe("requiereCancelacionAlEliminar", () => {
    it("devuelve true para visitas abiertas", () => {
      expect(requiereCancelacionAlEliminar("activa")).toBe(true);
      expect(requiereCancelacionAlEliminar("sin_salida")).toBe(true);
    });

    it("devuelve false para el resto de estados", () => {
      expect(requiereCancelacionAlEliminar("programada")).toBe(false);
      expect(requiereCancelacionAlEliminar("finalizada")).toBe(false);
      expect(requiereCancelacionAlEliminar("cancelada")).toBe(false);
    });
  });
});
