import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { MinioService as NestMinioService } from 'nestjs-minio-client';
import { Readable } from 'stream';
import { decryptFile, encryptFile } from '../common/crypto/field-crypto';

/** Dimensione massima di un file gestito dall'app (i file vengono cifrati/decifrati in memoria). */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class MinioService {
  private readonly bucketName = process.env.MINIO_BUCKET || 'mst-gestionale';

  constructor(private readonly minioClient: NestMinioService) {}

  /**
   * Sanitizza un nome file o path per MinIO.
   * Rimuove caratteri pericolosi, previene path traversal e normalizza il path.
   */
  sanitizePath(path: string): string {
    if (!path) return '';

    return path
      // Rimuove null bytes
      .replace(/\0/g, '')
      // Rimuove path traversal attempts
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      // Rimuove caratteri di controllo
      .replace(/[\x00-\x1f\x7f]/g, '')
      // Rimuove caratteri problematici per filesystem/URL
      .replace(/[<>:"|?*\\]/g, '')
      // Sostituisce spazi multipli con underscore
      .replace(/\s+/g, '_')
      // Rimuove slash iniziali (previene path assoluti)
      .replace(/^\/+/, '')
      // Normalizza slash multipli
      .replace(/\/+/g, '/')
      // Rimuove caratteri non ASCII (opzionale, mantiene solo alfanumerici e alcuni simboli)
      .replace(/[^\w\-_.\/]/g, '_')
      // Limita lunghezza
      .substring(0, 255);
  }

  /**
   * Sanitizza un nome file (senza path).
   */
  sanitizeFilename(filename: string): string {
    if (!filename) return 'unnamed';

    const sanitized = filename
      // Rimuove null bytes
      .replace(/\0/g, '')
      // Rimuove path separators
      .replace(/[\/\\]/g, '')
      // Rimuove caratteri di controllo
      .replace(/[\x00-\x1f\x7f]/g, '')
      // Rimuove caratteri problematici
      .replace(/[<>:"|?*]/g, '')
      // Sostituisce spazi con underscore
      .replace(/\s+/g, '_')
      // Rimuove caratteri non ASCII
      .replace(/[^\w\-_.]/g, '_')
      // Rimuove underscore multipli
      .replace(/_+/g, '_')
      // Limita lunghezza
      .substring(0, 200);

    return sanitized || 'unnamed';
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.minioClient.client.bucketExists(this.bucketName);
    if (!exists) {
      await this.minioClient.client.makeBucket(this.bucketName);
    }
  }

  /**
   * Carica un file cifrandolo (AES-256-GCM). Un buffer già cifrato (es. restore di un backup) non viene ricifrato.
   */
  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException(`File troppo grande (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`);
    }
    return this.uploadRaw(objectName, encryptFile(buffer), contentType);
  }

  /** Carica i byte così come sono (già cifrati). */
  async uploadRaw(objectName: string, buffer: Buffer, contentType?: string): Promise<string> {
    await this.ensureBucket();

    const sanitizedObjectName = this.sanitizePath(objectName);
    const metaData = contentType ? { 'Content-Type': contentType } : {};

    try {
      await this.minioClient.client.putObject(
        this.bucketName,
        sanitizedObjectName,
        buffer,
        buffer.length,
        metaData,
      );
    } catch (error) {
      console.error(`[MinIO] Error uploading file ${sanitizedObjectName}:`, error);
      throw error;
    }

    return sanitizedObjectName;
  }

  /** Restituisce il contenuto decifrato del file (i file legacy non cifrati vengono restituiti invariati). */
  async getFile(objectName: string): Promise<Readable> {
    return Readable.from([await this.getFileBuffer(objectName)]);
  }

  async getFileBuffer(objectName: string): Promise<Buffer> {
    return decryptFile(await this.getRawBuffer(objectName));
  }

  /** Byte così come sono salvati su MinIO (cifrati): per backup e migrazioni. */
  async getRawBuffer(objectName: string): Promise<Buffer> {
    const stream = await this.minioClient.client.getObject(this.bucketName, objectName);
    return streamToBuffer(stream);
  }

  async deleteFile(objectName: string): Promise<void> {
    await this.minioClient.client.removeObject(this.bucketName, objectName);
  }

  async listFiles(prefix?: string): Promise<string[]> {
    const objects: string[] = [];
    const stream = this.minioClient.client.listObjects(this.bucketName, prefix, true);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj.name));
      stream.on('error', reject);
      stream.on('end', () => resolve(objects));
    });
  }

  async copyFile(sourcePath: string, destPath: string): Promise<string> {
    const sanitizedDestPath = this.sanitizePath(destPath);
    
    const copyConditions = new (require('minio').CopyConditions)();
    await this.minioClient.client.copyObject(
      this.bucketName,
      sanitizedDestPath,
      `/${this.bucketName}/${sourcePath}`,
      copyConditions,
    );
    
    return sanitizedDestPath;
  }

  async moveFile(sourcePath: string, destPath: string): Promise<string> {
    const newPath = await this.copyFile(sourcePath, destPath);
    await this.deleteFile(sourcePath);
    return newPath;
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.minioClient.client.statObject(this.bucketName, objectName);
      return true;
    } catch {
      return false;
    }
  }
}
