/**
 * @file html-utils.ts
 * @description Utilidades para escapar HTML y generar texto plano desde contenido HTML.
 */

/**
 * Escapa caracteres especiales para insertar texto seguro en plantillas HTML.
 * @param value - Cadena con posible contenido dinámico del usuario.
 * @returns Cadena con entidades HTML escapadas.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Elimina etiquetas HTML y normaliza espacios para versiones en texto plano.
 * @param value - Contenido HTML o mixto.
 * @returns Texto plano sin etiquetas y con espacios colapsados.
 */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
