import { validateErsDocument } from "./ers-documents.validation";

describe("validateErsDocument", () => {
  test.each([
    ["captura.png", "image/png"],
    ["foto.jpg", "image/jpeg"],
    ["animacion.gif", "image/gif"],
    ["manual.pdf", "application/pdf"],
    ["notas.txt", "text/plain"],
  ])("acepta %s", (originalname, mimetype) => {
    expect(() => validateErsDocument({ originalname, mimetype, size: 1, maxBytes: 10 })).not.toThrow();
  });

  test("rechaza extensiones no permitidas", () => {
    expect(() => validateErsDocument({ originalname: "vector.svg", mimetype: "image/svg+xml", size: 1, maxBytes: 10 })).toThrow();
  });

  test("rechaza MIME que no coincide con la extensión", () => {
    expect(() => validateErsDocument({ originalname: "falso.jpg", mimetype: "application/pdf", size: 1, maxBytes: 10 })).toThrow();
  });

  test("rechaza archivos vacíos y demasiado grandes", () => {
    expect(() => validateErsDocument({ originalname: "vacio.txt", mimetype: "text/plain", size: 0, maxBytes: 10 })).toThrow();
    expect(() => validateErsDocument({ originalname: "grande.pdf", mimetype: "application/pdf", size: 11, maxBytes: 10 })).toThrow();
  });
});
