/**
 * @file company-search.utils.spec.ts
 * @description Pruebas unitarias de `parseCompanySearch` para tokens de estado y texto libre.
 */
import { parseCompanySearch } from "./company-search.utils";

describe("parseCompanySearch", () => {
  it("detects inactive prefix inac", () => {
    expect(parseCompanySearch("inac")).toEqual({ isActive: false });
  });

  it("detects active prefix activ", () => {
    expect(parseCompanySearch("activ")).toEqual({ isActive: true });
  });

  it("keeps text search for regular terms", () => {
    expect(parseCompanySearch("pettengill")).toEqual({ text: "pettengill" });
  });

  it("combines status token with text", () => {
    expect(parseCompanySearch("inac pettengill")).toEqual({
      isActive: false,
      text: "pettengill",
    });
  });

  it("prefers inactive over active for inac", () => {
    expect(parseCompanySearch("inactiva")).toEqual({ isActive: false });
  });
});
