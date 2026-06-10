/**
 * @file local-attachment.storage.ts
 * @description Gestiona el almacenamiento en disco de adjuntos con rutas seguras y directorio temporal.
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import { dirname, join, resolve } from "path";
import { randomUUID } from "crypto";
import type { ReadStream } from "fs";
import type { AppConfig } from "../../config/configuration";
import { sanitizeAttachmentFilename } from "./attachment-filename.utils";

/** Resultado de persistir un archivo con su clave y ruta absoluta. */
export interface StoredAttachmentFile {
  storageKey: string;
  absolutePath: string;
}

/**
 * Almacenamiento local de adjuntos en el sistema de archivos.
 */
@Injectable()
export class LocalAttachmentStorage implements OnModuleInit {
  private readonly logger = new Logger(LocalAttachmentStorage.name);
  private storageRoot = "";

  /**
   * Inyecta el servicio de configuración.
   * @param config - Configuración de la aplicación.
   */
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Inicializa directorios de almacenamiento y temporal al arrancar el módulo.
   * @returns Promesa resuelta cuando los directorios existen.
   */
  async onModuleInit(): Promise<void> {
    const configured = this.config.get("attachments.storagePath", { infer: true });
    this.storageRoot = resolve(configured);
    await mkdir(this.storageRoot, { recursive: true });
    await mkdir(this.getTempDir(), { recursive: true });
    this.logger.log(`Attachment storage root: ${this.storageRoot}`);
  }

  /**
   * Obtiene la ruta del directorio temporal de subidas.
   * @returns Ruta absoluta al subdirectorio `.tmp` bajo la raíz de almacenamiento.
   */
  getTempDir(): string {
    const root =
      this.storageRoot ||
      resolve(this.config.get("attachments.storagePath", { infer: true }));
    return join(root, ".tmp");
  }

  /**
   * Garantiza que el directorio temporal exista antes de recibir archivos.
   * @returns Promesa resuelta tras crear el directorio si hace falta.
   */
  async ensureTempDir(): Promise<void> {
    await mkdir(this.getTempDir(), { recursive: true });
  }

  /**
   * Genera una clave de almacenamiento única y segura para un adjunto.
   * @param ticketId - ID del ticket propietario.
   * @param originalFilename - Nombre original del archivo subido.
   * @returns Clave relativa `{ticketId}/{uuid}_{nombreSeguro}`.
   */
  buildStorageKey(ticketId: number, originalFilename: string): string {
    const safeName = sanitizeAttachmentFilename(originalFilename);
    return `${ticketId}/${randomUUID()}_${safeName}`;
  }

  /**
   * Resuelve la ruta absoluta de una clave evitando traversal fuera de la raíz.
   * @param storageKey - Clave relativa del archivo en almacenamiento.
   * @returns Ruta absoluta validada dentro del directorio raíz.
   * @throws {Error} Si la clave es inválida o escapa del directorio raíz.
   */
  resolveAbsolutePath(storageKey: string): string {
    if (storageKey.includes("..")) {
      throw new Error("Invalid attachment storage key");
    }
    const absolute = resolve(this.storageRoot, storageKey);
    if (absolute !== this.storageRoot && !absolute.startsWith(`${this.storageRoot}\\`) && !absolute.startsWith(`${this.storageRoot}/`)) {
      throw new Error("Invalid attachment storage key");
    }
    return absolute;
  }

  /**
   * Mueve un archivo temporal a su ubicación definitiva según la clave de almacenamiento.
   * @param tempPath - Ruta absoluta del archivo temporal de Multer.
   * @param storageKey - Clave relativa destino.
   * @returns Clave y ruta absoluta del archivo persistido.
   */
  async persistFromTemp(tempPath: string, storageKey: string): Promise<StoredAttachmentFile> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await rename(tempPath, absolutePath);
    return { storageKey, absolutePath };
  }

  /**
   * Abre un stream de lectura para un adjunto almacenado.
   * @param storageKey - Clave relativa del archivo.
   * @returns Stream de lectura del sistema de archivos.
   * @throws {Error} Si la clave es inválida o el archivo no existe.
   */
  openReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolveAbsolutePath(storageKey));
  }

  /**
   * Elimina un archivo del almacenamiento de forma best-effort.
   * @param storageKey - Clave relativa del archivo a borrar.
   * @returns Promesa resuelta aunque el archivo ya no exista.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveAbsolutePath(storageKey));
    } catch {
      // Best-effort cleanup after failed DB insert.
    }
  }
}
