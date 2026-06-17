/**
 * @file persona-photo.processor.spec.ts
 * @description Pruebas del procesamiento y límite de tamaño de fotos de persona.
 */
import sharp from "sharp";
import { PERSONA_PHOTO_MAX_OUTPUT_BYTES } from "./persona-photo.constants";
import { processPersonaPhoto } from "./persona-photo.processor";

describe("processPersonaPhoto", () => {
  it("comprime una imagen válida por debajo de 15 MB", async () => {
    const input = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 120, g: 180, b: 220 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processPersonaPhoto(input);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.buffer.length).toBeLessThanOrEqual(PERSONA_PHOTO_MAX_OUTPUT_BYTES);
  });

  it("rechaza archivos que no son imágenes", async () => {
    await expect(processPersonaPhoto(Buffer.from("not-an-image"))).rejects.toMatchObject({
      status: 400,
    });
  });
});
