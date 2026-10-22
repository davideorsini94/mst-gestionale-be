import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import { dataSource } from '../datasources/data-source';
import { decryptFile, decryptString, encryptFile, isEncryptedFile } from '../common/crypto/field-crypto';
import { MinioService } from './minio.service';

export const STORAGE_MIGRATION_SETTING = '__storageEncryptionV1';

/** Cartella degli oggetti non collegati a nessun dato: nome = hash del vecchio nome (che poteva contenere dati personali). */
export const UNLINKED_PREFIX = 'non-collegati/';

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

const SAFE_EXTENSION = /^\.[a-z0-9]{1,8}$/;

/** Nome opaco e deterministico per un oggetto non referenziato (lo stesso vecchio nome dà sempre lo stesso risultato). */
export function unlinkedObjectName(objectName: string): string {
  const hash = createHash('sha256').update(objectName, 'utf8').digest('hex').slice(0, 32);
  const ext = path.posix.extname(objectName).toLowerCase();
  return `${UNLINKED_PREFIX}${hash}${SAFE_EXTENSION.test(ext) ? ext : ''}`;
}

const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-\d+)?(\.[a-z0-9]{1,8})?$/i;

/**
 * Nome già senza dati personali: oggetto in non-collegati/ o file con nome uuid (anche "uuid-numero" delle ricevute)
 * in cartelle fatte solo di lettere, cifre e trattini (ricevute/2025, members/{uuid}/documents/carta-identita, …).
 */
export function hasOpaqueName(objectName: string): boolean {
  if (objectName.startsWith(UNLINKED_PREFIX)) return true;
  const segments = objectName.split('/');
  const basename = segments.pop() ?? '';
  return UUID_NAME.test(basename) && segments.every((s) => /^[A-Za-z0-9-]+$/.test(s));
}

export interface Reference {
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
  /** "tabella/uuid" (mai il percorso: può contenere nomi e codici fiscali) */
  missing: string[];
  /** Percorsi di file mancanti sostituiti con un nome opaco nel DB. */
  missingRenamed: number;
  unreferencedEncrypted: number;
  unreferencedMoved: number;
  unreferencedDuplicatesRemoved: number;
  errors: string[];
}

export interface StorageMigrationOptions {
  /** Esegue anche se la migrazione risulta già fatta (FORCE_STORAGE_MIGRATION=true fa lo stesso all'avvio). */
  force?: boolean;
  /**
   * Dopo un ripristino da Impostazioni: DB e file possono arrivare da backup diversi o in momenti diversi, quindi
   * nessuna soglia sui mancanti, nessuna riscrittura dei loro percorsi e nessuna cancellazione di copie non collegate
   * (vengono solo spostate in non-collegati/, da cui una migrazione successiva le ricollega).
   */
  afterRestore?: boolean;
}

/** Accesso al DB della migrazione (separato per i test). */
export class StorageMigrationStore {
  async isDone(): Promise<boolean> {
    const rows = await dataSource.query(`SELECT 1 FROM settings WHERE key = $1`, [STORAGE_MIGRATION_SETTING]);
    return rows.length > 0;
  }

  async markDone(summary: Record<string, unknown>): Promise<void> {
    await dataSource.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [STORAGE_MIGRATION_SETTING, JSON.stringify(summary), 'Cifratura file MinIO v1.4 (non modificare)'],
    );
  }

  async loadReceipts(): Promise<{ uuid: string; path: string; year: number | null }[]> {
    return dataSource.query(
      `SELECT uuid::text AS uuid, "receiptMinioPath" AS path, "receiptYear" AS year
       FROM transactions WHERE "receiptMinioPath" IS NOT NULL AND "receiptMinioPath" <> ''`,
    );
  }

  async loadFiles(): Promise<{ uuid: string; path: string; name: string | null }[]> {
    return dataSource.query(`SELECT uuid::text AS uuid, "minioPath" AS path, "originalName" AS name FROM files`);
  }

  /**
   * Tutti i percorsi usati dal DB: oltre a movimenti e file, le ricevute annullate e i duplicati archiviati
   * (ripristinabili con il loro PDF), che non vanno spostati né cancellati.
   */
  async referencedPaths(): Promise<Set<string>> {
    const rows = await dataSource.query(
      `SELECT "receiptMinioPath" AS p FROM transactions WHERE "receiptMinioPath" IS NOT NULL
       UNION SELECT "minioPath" FROM files
       UNION SELECT "minioPath" FROM annulled_receipts WHERE "minioPath" IS NOT NULL
       UNION SELECT data->>'receiptMinioPath' FROM transactions_removed_duplicates
             WHERE data->>'receiptMinioPath' IS NOT NULL`,
    );
    return new Set<string>(rows.map((r: { p: string }) => r.p));
  }

  /** Un oggetto condiviso da più righe si cancella solo quando nessuna lo referenzia più. */
  async isStillReferenced(objectName: string): Promise<boolean> {
    const rows = await dataSource.query(
      `SELECT 1 FROM transactions WHERE "receiptMinioPath" = $1
       UNION ALL SELECT 1 FROM files WHERE "minioPath" = $1
       UNION ALL SELECT 1 FROM annulled_receipts WHERE "minioPath" = $1
       UNION ALL SELECT 1 FROM transactions_removed_duplicates WHERE data->>'receiptMinioPath' = $1
       LIMIT 1`,
      [objectName],
    );
    return rows.length > 0;
  }

  /** Aggiorna il percorso solo se nel DB c'è ancora quello letto all'inizio (compare-and-swap). */
  async compareAndSwap(ref: Reference, target: string): Promise<boolean> {
    const result = await dataSource.query(
      `UPDATE "${ref.table}" SET "${ref.column}" = $1 WHERE uuid = $2::uuid AND "${ref.column}" = $3`,
      [target, ref.uuid, ref.currentPath],
    );
    // pg restituisce [rows, rowCount] per gli UPDATE
    const rowCount = Array.isArray(result) ? result[1] : (result as any)?.rowCount;
    return rowCount === 1;
  }
}

/** Stato di un'esecuzione. */
interface RunContext {
  report: StorageMigrationReport;
  options: StorageMigrationOptions;
  /** SHA-256 del contenuto in chiaro dei file referenziati e verificati. */
  referencedHashes: Set<string>;
  missingRefs: { ref: Reference; target: string }[];
}

/**
 * Cifra i file su MinIO e toglie i dati personali dai nomi
 * (es. ricevute/2024/12-Mario_Rossi_20240105.pdf → ricevute/2024/{uuid}.pdf).
 *
 * Gira all'avvio PRIMA che l'app accetti richieste (e dopo i ripristini da Impostazioni), è idempotente e
 * riprendibile; i file già migrati non vengono riscritti:
 *  1. oggetti referenziati dal DB: copia cifrata nel nuovo percorso, rilettura e verifica dello SHA-256 del contenuto,
 *     aggiornamento del DB con compare-and-swap, solo dopo cancellazione del vecchio oggetto. Un oggetto non viene mai
 *     cancellato se il suo contenuto non è presente nel percorso referenziato dal DB;
 *  2. oggetti non referenziati: se il contenuto coincide con un file referenziato è una copia rimasta da
 *     un'interruzione e si cancella; altrimenti si cifrano e, se il nome può contenere dati personali, si spostano in
 *     non-collegati/{hash del vecchio nome} (la copia è verificata prima di cancellare l'originale);
 *  3. file referenziati ma mancanti: il percorso nel DB (con dati personali) diventa opaco.
 * Gli errori di MinIO diversi da "oggetto inesistente" bloccano la migrazione.
 * A fine lavoro registra in settings che la migrazione è completa (FORCE_STORAGE_MIGRATION=true per rieseguirla).
 */
@Injectable()
export class StorageEncryptionMigration {
  private readonly logger = new Logger(StorageEncryptionMigration.name);
  /** Sostituibile nei test. */
  store = new StorageMigrationStore();

  constructor(private readonly minioService: MinioService) {}

  async run(options: StorageMigrationOptions = {}): Promise<StorageMigrationReport | null> {
    const force = options.force || process.env.FORCE_STORAGE_MIGRATION === 'true';
    if (!force && (await this.store.isDone())) {
      return null;
    }

    this.logger.log('Cifratura dei file su MinIO in corso...');
    await this.minioService.ensureBucket();

    const ctx: RunContext = {
      report: {
        referenced: 0,
        moved: 0,
        alreadyDone: 0,
        missing: [],
        missingRenamed: 0,
        unreferencedEncrypted: 0,
        unreferencedMoved: 0,
        unreferencedDuplicatesRemoved: 0,
        errors: [],
      },
      options,
      referencedHashes: new Set(),
      missingRefs: [],
    };
    const { report } = ctx;

    const references = await this.loadReferences();
    report.referenced = references.length;
    let index = 0;
    for (const ref of references) {
      index++;
      try {
        await this.migrateReference(ref, ctx);
      } catch (error) {
        report.errors.push(`${ref.table}/${ref.uuid}: ${error.message}`);
      }
      if (index % 500 === 0) {
        this.logger.log(`File referenziati: ${index}/${references.length}`);
      }
    }

    // Molti file mancanti = bucket sbagliato/vuoto o MinIO non montato: ci si ferma prima di toccare gli oggetti non
    // referenziati e i percorsi nel DB. Soglia: più di 10 file e più del 2% dei referenziati.
    const tooManyMissing = report.missing.length > 10 && report.missing.length > report.referenced * 0.02;
    const missingBlocked = tooManyMissing && !options.afterRestore && process.env.ALLOW_MISSING_FILES !== 'true';

    if (!report.errors.length && !missingBlocked) {
      await this.processUnreferenced(ctx);
    }

    this.logger.log(
      `Migrazione file completata: ${report.referenced} referenziati (${report.moved} migrati, ` +
        `${report.alreadyDone} già a posto), non referenziati: ${report.unreferencedMoved} spostati in ` +
        `${UNLINKED_PREFIX}, ${report.unreferencedEncrypted} cifrati, ${report.unreferencedDuplicatesRemoved} copie ` +
        `rimosse; ${report.missing.length} mancanti, ${report.errors.length} errori`,
    );
    for (const missing of report.missing.slice(0, 50)) this.logger.warn(`File mancante: ${missing}`);
    for (const error of report.errors.slice(0, 50)) this.logger.error(error);

    if (report.errors.length) {
      throw new Error(`Migrazione dei file non completata: ${report.errors.length} errori (vedi log)`);
    }
    if (missingBlocked) {
      throw new Error(
        `Migrazione dei file non completata: ${report.missing.length} file su ${report.referenced} non trovati nel ` +
          `bucket "${process.env.MINIO_BUCKET}". Controlla MINIO_BUCKET e MinIO (ALLOW_MISSING_FILES=true per forzare)`,
      );
    }

    if (!options.afterRestore) {
      await this.renameMissing(ctx);
    }

    await this.store.markDone({ completedAt: new Date().toISOString(), ...report, missing: report.missing.length });
    return report;
  }

  private async loadReferences(): Promise<Reference[]> {
    const references: Reference[] = [];

    for (const r of await this.store.loadReceipts()) {
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

    for (const f of await this.store.loadFiles()) {
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
    return SAFE_EXTENSION.test(ext) ? ext : '';
  }

  private exists(objectName: string): Promise<boolean> {
    return this.minioService.fileExists(objectName);
  }

  /** Scrive la copia cifrata e la rilegge: il contenuto decifrato deve avere lo SHA-256 atteso. */
  private async writeVerified(objectName: string, plain: Buffer, expectedHash: string): Promise<void> {
    await this.minioService.uploadRaw(objectName, encryptFile(plain), this.contentType(objectName), { keepName: true });
    const readBack = await this.minioService.getRawBuffer(objectName);
    if (!isEncryptedFile(readBack) || sha256(decryptFile(readBack)) !== expectedHash) {
      throw new Error('verifica della copia cifrata fallita');
    }
  }

  private async migrateReference(ref: Reference, ctx: RunContext): Promise<void> {
    const { report } = ctx;
    const target = this.minioService.sanitizePath(ref.targetPath);
    let source = ref.currentPath;

    if (!(await this.exists(source))) {
      // Ripresa dopo un'interruzione: il DB punta ancora al vecchio percorso ma la copia nuova c'è già
      if (target !== ref.currentPath && (await this.exists(target))) {
        const copy = await this.minioService.getRawBuffer(target);
        if (isEncryptedFile(copy)) {
          ctx.referencedHashes.add(sha256(decryptFile(copy))); // decifrare = verifica di integrità
          await this.store.compareAndSwap(ref, target);
          report.moved++;
          return;
        }
      }
      // Spostato in non-collegati/ da un'esecuzione precedente (es. file ripristinati prima del database)
      const unlinked = unlinkedObjectName(ref.currentPath);
      if (unlinked !== ref.currentPath && (await this.exists(unlinked))) {
        source = unlinked;
      } else {
        report.missing.push(`${ref.table}/${ref.uuid}`);
        ctx.missingRefs.push({ ref, target });
        return;
      }
    }

    const raw = await this.minioService.getRawBuffer(source);
    if (source === target && isEncryptedFile(raw)) {
      // già migrato: non si riscrive; l'impronta serve a riconoscere le copie rimaste da un'interruzione
      try {
        ctx.referencedHashes.add(sha256(decryptFile(raw)));
      } catch {
        this.logger.warn(`File cifrato non leggibile: ${ref.table}/${ref.uuid}`);
      }
      report.alreadyDone++;
      return;
    }

    const plain = decryptFile(raw);
    const expectedHash = sha256(plain);
    await this.writeVerified(target, plain, expectedHash);
    ctx.referencedHashes.add(expectedHash);

    if (target !== ref.currentPath) {
      const updated = await this.store.compareAndSwap(ref, target);
      if (!updated) {
        throw new Error('Il riferimento nel DB è cambiato durante la migrazione: vecchio file non cancellato');
      }
    }
    if (source !== target && !(await this.store.isStillReferenced(source))) {
      await this.minioService.deleteFile(source);
    }
    report.moved++;
  }

  private async processUnreferenced(ctx: RunContext): Promise<void> {
    const { report } = ctx;
    const referenced = await this.store.referencedPaths();
    const objects = await this.minioService.listFiles();

    for (const objectName of objects) {
      if (referenced.has(objectName)) continue;
      try {
        const raw = await this.minioService.getRawBuffer(objectName);
        const encrypted = isEncryptedFile(raw);
        // già migrato (cifrato e con nome opaco): non si tocca
        if (encrypted && hasOpaqueName(objectName)) continue;

        const plain = decryptFile(raw);
        const hash = sha256(plain);

        // Copia rimasta da un'interruzione tra l'aggiornamento del DB e la cancellazione del vecchio file: lo stesso
        // contenuto è già nel percorso referenziato (verificato). Dopo un ripristino si sposta soltanto (vedi opzioni).
        if (ctx.referencedHashes.has(hash) && !ctx.options.afterRestore) {
          await this.minioService.deleteFile(objectName);
          report.unreferencedDuplicatesRemoved++;
          continue;
        }

        const destination = hasOpaqueName(objectName) ? objectName : unlinkedObjectName(objectName);
        await this.writeVerified(destination, plain, hash);
        if (destination !== objectName) {
          await this.minioService.deleteFile(objectName);
          report.unreferencedMoved++;
        } else {
          report.unreferencedEncrypted++;
        }
      } catch (error) {
        report.errors.push(`non referenziato ${unlinkedObjectName(objectName)}: ${error.message}`);
      }
    }
  }

  /**
   * File referenziati ma mancanti: il vecchio percorso (con nome e cognome) non deve restare nel DB. Il file resta
   * mancante; il nome originale è già cifrato in files.originalName.
   */
  private async renameMissing(ctx: RunContext): Promise<void> {
    for (const { ref, target } of ctx.missingRefs) {
      if (target === ref.currentPath || hasOpaqueName(ref.currentPath)) continue;
      if (await this.store.compareAndSwap(ref, target)) {
        ctx.report.missingRenamed++;
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
