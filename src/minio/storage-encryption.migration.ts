import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import { dataSource } from '../datasources/data-source';
import { decryptFile, decryptString, encryptFile, isEncryptedFile } from '../common/crypto/field-crypto';
import { MinioService } from './minio.service';

export const STORAGE_MIGRATION_SETTING = '__storageEncryptionV1';

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

interface Reference {
  table: 'transactions' | 'files';
  column: 'receiptMinioPath' | 'minioPath';
  uuid: string;
  currentPath: string;
  targetPath: string;
}

export interface StorageMigrationReport {
  referenced: number;
  moved: number;
  alreadyDone: number;
  missing: string[];
  unreferencedEncrypted: number;
  errors: string[];
}

/**
 * Cifra i file su MinIO e rinomina quelli il cui nome contiene dati personali
 * (es. ricevute/2024/12-Mario_Rossi_20240105.pdf → ricevute/2024/{uuid}.pdf).
 *
 * Gira all'avvio PRIMA che l'app accetti richieste ed è idempotente e riprendibile:
 *  1. per ogni oggetto referenziato dal DB: scrive la copia cifrata nel nuovo percorso, la rilegge e verifica che
 *     decifrata abbia lo stesso SHA-256 dell'originale, aggiorna il DB con compare-and-swap (WHERE path = vecchio),
 *     solo dopo cancella il vecchio oggetto. Un oggetto non viene mai cancellato se il suo contenuto non è
 *     presente nel percorso referenziato dal DB.
 *  2. gli oggetti non referenziati vengono cifrati sul posto (dopo verifica), mantenendo il nome.
 * A fine lavoro registra in settings che la migrazione è completa (FORCE_STORAGE_MIGRATION=true per rieseguirla).
 */
@Injectable()
export class StorageEncryptionMigration {
  private readonly logger = new Logger(StorageEncryptionMigration.name);

  constructor(private readonly minioService: MinioService) {}

  async run(): Promise<StorageMigrationReport | null> {
    const done = await dataSource.query(`SELECT value FROM settings WHERE key = $1`, [STORAGE_MIGRATION_SETTING]);
    if (done.length && process.env.FORCE_STORAGE_MIGRATION !== 'true') {
      return null;
    }

    this.logger.log('Cifratura dei file su MinIO in corso...');
    await this.minioService.ensureBucket();

    const report: StorageMigrationReport = {
      referenced: 0,
      moved: 0,
      alreadyDone: 0,
      missing: [],
      unreferencedEncrypted: 0,
      errors: [],
    };

    const references = await this.loadReferences();
    report.referenced = references.length;
    let index = 0;
    for (const ref of references) {
      index++;
      try {
        await this.migrateReference(ref, report);
      } catch (error) {
        report.errors.push(`${ref.table}/${ref.uuid} (${ref.currentPath}): ${error.message}`);
      }
      if (index % 500 === 0) {
        this.logger.log(`File referenziati: ${index}/${references.length}`);
      }
    }

    await this.encryptUnreferenced(report);

    this.logger.log(
      `Migrazione file completata: ${report.referenced} referenziati (${report.moved} migrati, ` +
        `${report.alreadyDone} già a posto), ${report.unreferencedEncrypted} non referenziati cifrati, ` +
        `${report.missing.length} mancanti, ${report.errors.length} errori`,
    );
    for (const missing of report.missing.slice(0, 50)) this.logger.warn(`File mancante: ${missing}`);
    for (const error of report.errors.slice(0, 50)) this.logger.error(error);

    if (report.errors.length) {
      throw new Error(`Migrazione dei file non completata: ${report.errors.length} errori (vedi log)`);
    }

    await dataSource.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [
        STORAGE_MIGRATION_SETTING,
        JSON.stringify({ completedAt: new Date().toISOString(), ...report, missing: report.missing.length }),
        'Cifratura file MinIO v1.4 (non modificare)',
      ],
    );
    return report;
  }

  private async loadReferences(): Promise<Reference[]> {
    const references: Reference[] = [];

    const receipts = await dataSource.query(
      `SELECT uuid::text AS uuid, "receiptMinioPath" AS path, "receiptYear" AS year
       FROM transactions WHERE "receiptMinioPath" IS NOT NULL AND "receiptMinioPath" <> ''`,
    );
    for (const r of receipts) {
      const folder = path.posix.dirname(r.path);
      const yearFolder = r.year ? `ricevute/${r.year}` : folder;
      references.push({
        table: 'transactions',
        column: 'receiptMinioPath',
        uuid: r.uuid,
        currentPath: r.path,
        targetPath: `${yearFolder}/${r.uuid}.pdf`,
      });
    }

    const files = await dataSource.query(
      `SELECT uuid::text AS uuid, "minioPath" AS path, "originalName" AS name, "mimeType" AS mime FROM files`,
    );
    for (const f of files) {
      const folder = path.posix.dirname(f.path);
      const ext = this.safeExtension(f.name, f.path);
      references.push({
        table: 'files',
        column: 'minioPath',
        uuid: f.uuid,
        currentPath: f.path,
        targetPath: `${folder}/${f.uuid}${ext}`,
      });
    }
    return references;
  }

  /** Estensione dal nome originale (cifrato nel DB) o dal vecchio percorso; solo caratteri sicuri. */
  private safeExtension(encryptedName: string | null, oldPath: string): string {
    let name = oldPath;
    try {
      if (encryptedName) name = decryptString(encryptedName, 'files.originalName');
    } catch {
      // usa il vecchio percorso
    }
    const ext = path.posix.extname(name).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
  }

  private async exists(objectName: string): Promise<boolean> {
    return this.minioService.fileExists(objectName);
  }

  private async migrateReference(ref: Reference, report: StorageMigrationReport): Promise<void> {
    const target = this.minioService.sanitizePath(ref.targetPath);
    const currentExists = await this.exists(ref.currentPath);

    if (!currentExists) {
      // Ripresa dopo un'interruzione: il DB punta ancora al vecchio percorso ma la copia nuova c'è già
      if (target !== ref.currentPath && (await this.exists(target))) {
        const copy = await this.minioService.getRawBuffer(target);
        if (isEncryptedFile(copy)) {
          decryptFile(copy); // verifica di integrità
          await this.compareAndSwap(ref, target);
          report.moved++;
          return;
        }
      }
      report.missing.push(`${ref.table}/${ref.uuid}: ${ref.currentPath}`);
      return;
    }

    const raw = await this.minioService.getRawBuffer(ref.currentPath);
    if (ref.currentPath === target && isEncryptedFile(raw)) {
      report.alreadyDone++;
      return;
    }

    const plain = decryptFile(raw);
    const expectedHash = sha256(plain);
    const encrypted = encryptFile(plain);

    await this.minioService.uploadRaw(target, encrypted, this.contentType(target));
    const readBack = await this.minioService.getRawBuffer(target);
    if (!isEncryptedFile(readBack) || sha256(decryptFile(readBack)) !== expectedHash) {
      throw new Error(`Verifica della copia cifrata fallita (${target})`);
    }

    if (target !== ref.currentPath) {
      const updated = await this.compareAndSwap(ref, target);
      if (!updated) {
        throw new Error('Il riferimento nel DB è cambiato durante la migrazione: vecchio file non cancellato');
      }
      if (!(await this.isStillReferenced(ref.currentPath))) {
        await this.minioService.deleteFile(ref.currentPath);
      }
    }
    report.moved++;
  }

  /** Un oggetto condiviso da più righe si cancella solo quando nessuna lo referenzia più. */
  private async isStillReferenced(objectName: string): Promise<boolean> {
    const rows = await dataSource.query(
      `SELECT 1 FROM transactions WHERE "receiptMinioPath" = $1 UNION ALL SELECT 1 FROM files WHERE "minioPath" = $1 LIMIT 1`,
      [objectName],
    );
    return rows.length > 0;
  }

  private async compareAndSwap(ref: Reference, target: string): Promise<boolean> {
    const result = await dataSource.query(
      `UPDATE "${ref.table}" SET "${ref.column}" = $1 WHERE uuid = $2::uuid AND "${ref.column}" = $3`,
      [target, ref.uuid, ref.currentPath],
    );
    // pg restituisce [rows, rowCount] per gli UPDATE
    const rowCount = Array.isArray(result) ? result[1] : (result as any)?.rowCount;
    return rowCount === 1;
  }

  private async encryptUnreferenced(report: StorageMigrationReport): Promise<void> {
    const referencedRows = await dataSource.query(
      `SELECT "receiptMinioPath" AS p FROM transactions WHERE "receiptMinioPath" IS NOT NULL
       UNION SELECT "minioPath" AS p FROM files`,
    );
    const referenced = new Set<string>(referencedRows.map((r: any) => r.p));
    const objects = await this.minioService.listFiles();

    for (const objectName of objects) {
      if (referenced.has(objectName)) continue;
      try {
        const raw = await this.minioService.getRawBuffer(objectName);
        if (isEncryptedFile(raw)) continue;
        const expectedHash = sha256(raw);
        await this.minioService.uploadRaw(objectName, encryptFile(raw), this.contentType(objectName));
        const readBack = await this.minioService.getRawBuffer(objectName);
        if (sha256(decryptFile(readBack)) !== expectedHash) {
          throw new Error('verifica fallita');
        }
        report.unreferencedEncrypted++;
      } catch (error) {
        report.errors.push(`non referenziato ${objectName}: ${error.message}`);
      }
    }
  }

  private contentType(objectName: string): string {
    const ext = path.posix.extname(objectName).toLowerCase();
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
