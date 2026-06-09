import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import { dirname, join, resolve } from "path";
import { randomUUID } from "crypto";
import type { ReadStream } from "fs";
import type { AppConfig } from "../../config/configuration";
import { sanitizeAttachmentFilename } from "./attachment-filename.utils";

export interface StoredAttachmentFile {
  storageKey: string;
  absolutePath: string;
}

@Injectable()
export class LocalAttachmentStorage implements OnModuleInit {
  private readonly logger = new Logger(LocalAttachmentStorage.name);
  private storageRoot = "";

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const configured = this.config.get("attachments.storagePath", { infer: true });
    this.storageRoot = resolve(configured);
    await mkdir(this.storageRoot, { recursive: true });
    await mkdir(this.getTempDir(), { recursive: true });
    this.logger.log(`Attachment storage root: ${this.storageRoot}`);
  }

  getTempDir(): string {
    const root =
      this.storageRoot ||
      resolve(this.config.get("attachments.storagePath", { infer: true }));
    return join(root, ".tmp");
  }

  async ensureTempDir(): Promise<void> {
    await mkdir(this.getTempDir(), { recursive: true });
  }

  buildStorageKey(ticketId: number, originalFilename: string): string {
    const safeName = sanitizeAttachmentFilename(originalFilename);
    return `${ticketId}/${randomUUID()}_${safeName}`;
  }

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

  async persistFromTemp(tempPath: string, storageKey: string): Promise<StoredAttachmentFile> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await rename(tempPath, absolutePath);
    return { storageKey, absolutePath };
  }

  openReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolveAbsolutePath(storageKey));
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveAbsolutePath(storageKey));
    } catch {
      // Best-effort cleanup after failed DB insert.
    }
  }
}
