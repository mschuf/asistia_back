import { basename } from "path";

export function sanitizeAttachmentFilename(filename: string): string {
  const base = basename(filename).replace(/[^\w.\-()+ ]+/g, "_").trim();
  return base || "attachment";
}
