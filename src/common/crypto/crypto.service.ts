/**
 * @file crypto.service.ts
 * @description Servicio RSA para descifrar contraseñas enviadas cifradas desde el frontend.
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  constants,
} from "node:crypto";
import type { AppConfig } from "../../config/configuration";

/**
 * Gestiona claves RSA y descifrado OAEP de payloads en base64.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private privateKeyPem = "";
  private publicKeyPem = "";

  /** Inyecta la configuración de autenticación RSA. */
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Carga o genera el par de claves RSA al iniciar el módulo.
   * @returns void
   * @throws {Error} Si en producción no está configurada `AUTH_RSA_PRIVATE_KEY`.
   */
  onModuleInit(): void {
    const configuredPrivate = this.normalizePem(
      this.config.get("auth.rsa.privateKey", { infer: true }),
    );
    const configuredPublic = this.normalizePem(
      this.config.get("auth.rsa.publicKey", { infer: true }),
    );

    if (configuredPrivate) {
      this.privateKeyPem = configuredPrivate;
      this.publicKeyPem =
        configuredPublic ||
        createPublicKey(createPrivateKey(configuredPrivate)).export({
          type: "spki",
          format: "pem",
        }) as string;
      return;
    }

    const nodeEnv = this.config.get("server.nodeEnv", { infer: true });
    if (nodeEnv === "production") {
      throw new Error(
        "AUTH_RSA_PRIVATE_KEY is required in production. Generate an RSA key pair and configure it in the environment.",
      );
    }

    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
    this.logger.warn(
      "AUTH_RSA_PRIVATE_KEY not configured. Generated ephemeral RSA keys for development only.",
    );
  }

  /**
   * Devuelve la clave pública PEM expuesta al cliente para cifrar contraseñas.
   * @returns Clave pública en formato PEM.
   */
  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  /**
   * Descifra un payload RSA-OAEP codificado en base64.
   * @param encryptedBase64 - Texto cifrado en base64.
   * @returns Texto plano descifrado en UTF-8.
   */
  decrypt(encryptedBase64: string): string {
    const ciphertext = Buffer.from(encryptedBase64, "base64");
    const plaintext = privateDecrypt(
      {
        key: this.privateKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      ciphertext,
    );
    return plaintext.toString("utf8");
  }

  /**
   * Normaliza una clave PEM reemplazando `\n` escapados y recortando espacios.
   * @param value - Clave PEM cruda del entorno.
   * @returns PEM listo para uso con Node crypto.
   */
  private normalizePem(value: string): string {
    if (!value) return "";
    return value.replace(/\\n/g, "\n").trim();
  }
}
