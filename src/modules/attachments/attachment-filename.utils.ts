/**
 * @file attachment-filename.utils.ts
 * @description Utilidades para sanitizar nombres de archivo de adjuntos antes de persistirlos.
 */
import { basename } from "path";

/**
 * Limpia el nombre de archivo eliminando rutas y caracteres no seguros.
 * @param filename - Nombre o ruta original del archivo.
 * @returns Nombre base seguro; devuelve `attachment` si queda vacío tras sanitizar.
 */
export function sanitizeAttachmentFilename(filename: string): string {
  const base = basename(filename).replace(/[^\w.\-()+ ]+/g, "_").trim();
  return base || "attachment";
}
