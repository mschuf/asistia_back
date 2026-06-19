import { requiresTarjetaDisponibilidad } from "./visita-tarjeta-disponibilidad";

describe("visita-tarjeta-disponibilidad", () => {
  describe("requiresTarjetaDisponibilidad", () => {
    it("requiere disponibilidad para activa y sin_salida", () => {
      expect(requiresTarjetaDisponibilidad("activa")).toBe(true);
      expect(requiresTarjetaDisponibilidad("sin_salida")).toBe(true);
    });

    it("no requiere disponibilidad para otros estados", () => {
      expect(requiresTarjetaDisponibilidad("programada")).toBe(false);
      expect(requiresTarjetaDisponibilidad("finalizada")).toBe(false);
      expect(requiresTarjetaDisponibilidad("cancelada")).toBe(false);
    });
  });
});
