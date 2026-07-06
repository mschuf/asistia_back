/**
 * @file ers-documents.types.ts
 * @description Contratos de dominio para documentos asociados a proyectos ERS.
 */
import type { Readable } from "stream";
import type { ErsDocumentLimit } from "./dto/list-ers-documents-query.dto";

export interface ErsDocument {
  id: number;
  name: string;
  mimeType: string;
  createdAt: string | null;
}

export interface ErsDocumentList {
  items: ErsDocument[];
  total: number;
  page: number;
  limit: ErsDocumentLimit;
}

export interface ErsDocumentUpload {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

export interface ErsDocumentContent {
  stream: Readable;
  filename: string;
  mimeType: string;
  size: number | null;
}
