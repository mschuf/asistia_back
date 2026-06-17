/**
 * @file persona-photo.processor.ts
 * @description Procesa y comprime fotos de persona antes de persistirlas como blob.
 */
import { HttpStatus } from "@nestjs/common";
import sharp from "sharp";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import {
  PERSONA_PHOTO_MAX_DIMENSION,
  PERSONA_PHOTO_MAX_OUTPUT_BYTES,
} from "./persona-photo.constants";

const JPEG_QUALITIES = [85, 75, 65, 55, 45, 40] as const;

export interface ProcessedPersonaPhoto {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Normaliza, redimensiona y comprime una imagen para almacenamiento en BD.
 * @param input - Buffer crudo de la imagen subida.
 * @returns Buffer procesado y MIME type final.
 * @throws {BusinessException} Si la imagen es inválida o no puede comprimirse bajo 15 MB.
 */
export async function processPersonaPhoto(input: Buffer): Promise<ProcessedPersonaPhoto> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new BusinessException({
      message: "El archivo recibido no es una imagen válida",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
    });
  }

  if (!metadata.width || !metadata.height) {
    throw new BusinessException({
      message: "No se pudieron leer las dimensiones de la imagen",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
    });
  }

  let pipeline = sharp(input, { failOn: "none" }).rotate();

  if (metadata.width > PERSONA_PHOTO_MAX_DIMENSION || metadata.height > PERSONA_PHOTO_MAX_DIMENSION) {
    pipeline = pipeline.resize(PERSONA_PHOTO_MAX_DIMENSION, PERSONA_PHOTO_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });

  for (const quality of JPEG_QUALITIES) {
    const buffer = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= PERSONA_PHOTO_MAX_OUTPUT_BYTES) {
      return { buffer, mimeType: "image/jpeg" };
    }
  }

  throw new BusinessException({
    message: `La foto procesada supera el tamaño máximo permitido de ${PERSONA_PHOTO_MAX_OUTPUT_BYTES} bytes`,
    code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  });
}
