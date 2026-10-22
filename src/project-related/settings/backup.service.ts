import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { MAX_FILE_SIZE_BYTES, MinioService } from 'src/minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { StorageEncryptionMigration } from '../../minio/storage-encryption.migration';
import { decryptFile, isEncryptedFile, keyCheckMatches } from '../../common/crypto/field-crypto';
import { KEY_CHECK_SETTING } from '../../migrations/1760900001000-EncryptSensitiveData';

const execFileAsync = promisify(execFile);

/** Backup e file temporanei leggibili solo dall'utente del processo: contengono tutti i dati (cifrati e non). */
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

/** Risposta al client: solo nome e dimensione (mai il percorso sul server). */
export interface BackupFileInfo {
  filename: string;
  size: number;
}

interface BackupFile extends BackupFileInfo {
  path: string;
}

const publicInfo = ({ filename, size }: BackupFile): BackupFileInfo => ({ filename, size });

/** Nomi dei file di backup generati dall'app (niente percorsi: blocca ../ e simili). */
const BACKUP_FILENAME = /^(db|minio)-backup-[0-9TZ-]+\.(sql|tar)$/;

/** Cartelle in cui cercare pg_dump / pg_restore oltre al PATH (Homebrew, Debian/Ubuntu). */
const PG_BIN_FALLBACK_DIRS = [
  '/opt/homebrew/opt/libpq/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/usr/local/opt/libpq/bin',
  '/usr/local/opt/postgresql@16/bin',
  '/usr/lib/postgresql/16/bin',
];

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  /** BACKUP_DIR permette di montare la cartella come volume (dentro il container andrebbe persa a ogni aggiornamento) */
  private readonly backupDir = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));

  constructor(
    private readonly minioService: MinioService,
    private readonly storageMigration: StorageEncryptionMigration,
  ) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true, mode: PRIVATE_DIR_MODE });
    }
  }

  /** Percorso di pg_dump / pg_restore: PG_BIN_DIR, poi PATH, poi le cartelle abituali. */
  private findPgBinary(name: 'pg_dump' | 'pg_restore'): string {
    const dirs = [
      process.env.PG_BIN_DIR,
      ...(process.env.PATH || '').split(path.delimiter),
      ...PG_BIN_FALLBACK_DIRS,
    ].filter((d): d is string => !!d);
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // prossima cartella
      }
    }
    throw new InternalServerErrorException(
      `${name} non è installato sul server: il backup del database non è disponibile (installare il client PostgreSQL 16)`,
    );
  }

  private dbConnectionArgs(): string[] {
    return [
      '-h', process.env.DB_HOST || 'localhost',
      '-p', process.env.DB_PORT || '5432',
      '-U', process.env.DB_USERNAME || 'postgres',
    ];
  }

  /**
   * Esegue un programma senza shell (la password passa dall'ambiente, non dalla riga di comando).
   * stdout può essere scritto su file e stdin letto da file, così il dump non passa dalla memoria.
   */
  private runProcess(bin: string, args: string[], io: { stdoutFile?: string; stdinFile?: string } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'postgres' },
        stdio: [io.stdinFile ? 'pipe' : 'ignore', io.stdoutFile ? 'pipe' : 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr!.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });

      let output: fs.WriteStream | null = null;
      let outputDone: Promise<void> = Promise.resolve();
      if (io.stdoutFile) {
        output = fs.createWriteStream(io.stdoutFile, { mode: PRIVATE_FILE_MODE });
        outputDone = new Promise((res, rej) => {
          output!.on('finish', () => res());
          output!.on('error', rej);
        });
        child.stdout!.pipe(output);
      }
      if (io.stdinFile) {
        const input = fs.createReadStream(io.stdinFile);
        input.on('error', (err) => {
          child.kill();
          reject(err);
        });
        child.stdin!.on('error', () => undefined); // il processo può chiudere stdin prima della fine (errore già in stderr)
        input.pipe(child.stdin!);
      }

      child.on('error', reject);
      child.on('close', (code) => {
        outputDone
          .then(() => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `${path.basename(bin)} terminato con codice ${code}`));
          })
          .catch(reject);
      });
    });
  }

  async createDatabaseBackup(): Promise<BackupFileInfo> {
    return publicInfo(await this.writeDatabaseBackup());
  }

  private async writeDatabaseBackup(): Promise<BackupFile> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, filename);
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';

    this.logger.log(`Creating database backup: ${filename}`);
    const pgDump = this.findPgBinary('pg_dump');
    try {
      // formato "custom" (compresso), lo stesso letto dal ripristino
      await this.runProcess(pgDump, [...this.dbConnectionArgs(), '-F', 'c', '-b', dbName], { stdoutFile: backupPath });
      fs.chmodSync(backupPath, PRIVATE_FILE_MODE);
      const stats = fs.statSync(backupPath);
      if (stats.size === 0) throw new Error('il file di backup è vuoto');
      this.logger.log(`Database backup created successfully: ${filename} (${stats.size} bytes)`);
      return { filename, path: backupPath, size: stats.size };
    } catch (error) {
      fs.rmSync(backupPath, { force: true });
      this.logger.error(`Failed to create database backup: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Backup del database non riuscito: ${error.message}`);
    }
  }

  /**
   * Chiave di controllo cifratura contenuta nel backup (tabella settings), letta senza toccare il DB.
   * undefined = backup senza cifratura (v1.3): verrà cifrato dalle migrazioni dopo il ripristino.
   */
  private async readBackupKeyCheck(pgRestore: string, backupPath: string): Promise<string | undefined> {
    const out = path.join(this.backupDir, `.settings-${Date.now()}.txt`);
    try {
      await this.runProcess(pgRestore, ['--data-only', '--table=settings', '--file=-'], {
        stdinFile: backupPath,
        stdoutFile: out,
      });
      const line = fs
        .readFileSync(out, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(`${KEY_CHECK_SETTING}\t`));
      if (!line) return undefined;
      // COPY: key \t value(jsonb) \t ... (escape del formato testo: \\ → \)
      const raw = line.split('\t')[1].replace(/\\\\/g, '\\');
      const value = JSON.parse(raw);
      return typeof value === 'string' ? value : JSON.stringify(value);
    } finally {
      fs.rmSync(out, { force: true });
    }
  }

  private async replaceDatabaseWith(pgRestore: string, dbName: string, backupPath: string): Promise<void> {
    // Schema pulito prima del restore: con "-c" la tabella migrations della versione attuale sopravviverebbe a un
    // dump di una versione precedente (le migrazioni risulterebbero eseguite su dati non migrati).
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await this.runProcess(pgRestore, [...this.dbConnectionArgs(), '-d', dbName, '--no-owner', '--exit-on-error'], {
      stdinFile: backupPath,
    });
    // Porta il DB ripristinato alla versione attuale (cifratura compresa)
    const executed = await dataSource.runMigrations({ transaction: 'each' });
    this.logger.log(`Migrazioni eseguite dopo il restore: ${executed.map((m) => m.name).join(', ') || 'nessuna'}`);
  }

  /**
   * Ripristino del database. Prima di toccare qualsiasi cosa: il file deve essere leggibile per intero e, se cifrato,
   * con le stesse chiavi dell'app; poi si fa un backup di sicurezza del DB attuale, ricaricato in automatico se il
   * ripristino fallisce a metà.
   */
  async restoreDatabaseBackup(backupPath: string): Promise<{ safetyBackup: string }> {
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';
    const pgRestore = this.findPgBinary('pg_restore');

    this.logger.log('Ripristino del database da un file caricato');
    try {
      // lettura completa (non solo l'indice): un file troncato viene scartato qui
      await this.runProcess(pgRestore, ['--file=/dev/null'], { stdinFile: backupPath });
    } catch {
      throw new BadRequestException('Il file non è un backup del database valido o è incompleto: nessuna modifica effettuata');
    }

    const keyCheck = await this.readBackupKeyCheck(pgRestore, backupPath).catch((): undefined => undefined);
    if (keyCheck !== undefined && !keyCheckMatches(keyCheck)) {
      throw new BadRequestException(
        'Il backup è cifrato con chiavi diverse da quelle attuali: nessuna modifica effettuata',
      );
    }

    const safety = await this.writeDatabaseBackup();
    this.logger.log(`Backup di sicurezza prima del ripristino: ${safety.filename}`);

    try {
      await this.replaceDatabaseWith(pgRestore, dbName, backupPath);
      const check = await dataSource.query(`SELECT value FROM settings WHERE key = $1`, [KEY_CHECK_SETTING]);
      if (!check.length || !keyCheckMatches(check[0].value)) {
        throw new Error('il database ripristinato non corrisponde alle chiavi di cifratura attuali');
      }
      // forzata: i file possono essere stati spostati in non-collegati/ da un ripristino dei file fatto prima
      await this.storageMigration.run({ force: true, afterRestore: true });
      this.logger.log('Database restore completed successfully');
      return { safetyBackup: safety.filename };
    } catch (error) {
      this.logger.error(`Failed to restore database: ${error.message}`, error.stack);
      try {
        await this.replaceDatabaseWith(pgRestore, dbName, safety.path);
        this.logger.warn(`Ripristino fallito: database riportato allo stato precedente (${safety.filename})`);
      } catch (rollbackError) {
        this.logger.error(`Anche il ritorno allo stato precedente è fallito: ${rollbackError.message}`);
        throw new InternalServerErrorException(
          `Ripristino non riuscito (${error.message}) e ritorno automatico fallito: ripristina a mano il backup ${safety.filename}`,
        );
      }
      throw new InternalServerErrorException(
        `Ripristino non riuscito: ${error.message}. Il database è stato riportato allo stato precedente.`,
      );
    }
  }

  async createMinioBackup(): Promise<BackupFileInfo> {
    return publicInfo(await this.writeMinioBackup());
  }

  private async writeMinioBackup(): Promise<BackupFile> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `minio-backup-${timestamp}.tar`;
    const backupPath = path.join(this.backupDir, filename);
    const tempDir = path.join(this.backupDir, `temp-${timestamp}`);

    try {
      this.logger.log(`Creating MinIO backup: ${filename}`);
      fs.mkdirSync(tempDir, { recursive: true, mode: PRIVATE_DIR_MODE });

      const objectNames = await this.minioService.listFiles();
      this.logger.log(`Found ${objectNames.length} objects in MinIO bucket`);

      for (const objectName of objectNames) {
        this.minioService.assertSafeObjectName(objectName);
        const objectPath = path.join(tempDir, objectName);
        fs.mkdirSync(path.dirname(objectPath), { recursive: true, mode: PRIVATE_DIR_MODE });
        // Byte così come sono su MinIO: il backup resta cifrato (serve la chiave dell'app per leggerlo)
        fs.writeFileSync(objectPath, await this.minioService.getRawBuffer(objectName), { mode: PRIVATE_FILE_MODE });
      }

      await execFileAsync('tar', ['-cf', backupPath, '-C', tempDir, '.']);
      fs.chmodSync(backupPath, PRIVATE_FILE_MODE);
      const stats = fs.statSync(backupPath);

      this.logger.log(`MinIO backup created successfully: ${filename} (${stats.size} bytes)`);
      return { filename, path: backupPath, size: stats.size };
    } catch (error) {
      fs.rmSync(backupPath, { force: true });
      this.logger.error(`Failed to create MinIO backup: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Backup dei file non riuscito: ${error.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Ripristino dei file: gli oggetti vengono caricati con il nome che hanno nell'archivio (i riferimenti nel DB
   * restano validi), poi la migrazione dei file cifra quelli in chiaro e toglie i dati personali dai nomi (archivi
   * delle versioni precedenti). Gli oggetti già presenti e non contenuti nell'archivio non vengono toccati.
   */
  async restoreMinioBackup(backupPath: string): Promise<{ restored: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = path.join(this.backupDir, `restore-${timestamp}`);
    let filesUploaded = 0;
    let totalSize = 0;

    try {
      this.logger.log('[MinIO Restore] Ripristino dei file da un archivio caricato');
      if (!fs.existsSync(backupPath)) {
        throw new Error('file di backup non trovato');
      }

      fs.mkdirSync(tempDir, { recursive: true, mode: PRIVATE_DIR_MODE });
      try {
        await execFileAsync('tar', ['-xf', backupPath, '-C', tempDir, '--no-same-owner']);
      } catch {
        throw new BadRequestException('Il file non è un archivio di backup dei file valido: nessuna modifica effettuata');
      }

      // Prima di toccare MinIO: ogni file cifrato dell'archivio deve decifrarsi con le chiavi di questa installazione.
      // Prima un archivio di un'altra installazione (es. il test locale, che ha gli stessi nomi di produzione)
      // sovrascriveva i file buoni con file illeggibili, e l'errore arrivava solo dopo.
      const files: string[] = [];
      const collect = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) collect(fullPath);
          else if (entry.isFile()) files.push(fullPath);
        }
      };
      collect(tempDir);
      let unreadable = 0;
      for (const file of files) {
        const buffer = fs.readFileSync(file);
        if (!isEncryptedFile(buffer)) continue; // file in chiaro di un backup v1.3: li cifra la migrazione
        try {
          decryptFile(buffer);
        } catch {
          unreadable++;
        }
      }
      if (unreadable > 0) {
        throw new BadRequestException(
          `${unreadable} file dell'archivio sono cifrati con chiavi diverse da quelle di questa installazione ` +
            '(backup di un altro ambiente?): nessun file è stato modificato',
        );
      }

      // Solo file regolari: collegamenti simbolici o altro presenti nell'archivio vengono ignorati
      const uploadDir = async (dir: string, prefix = ''): Promise<void> => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await uploadDir(fullPath, objectName);
          } else if (entry.isFile()) {
            const buffer = fs.readFileSync(fullPath);
            // uploadFile non ricifra i file già cifrati e cifra quelli dei backup vecchi in chiaro; oltre il limite
            // dell'app si carica così com'è (lo cifra la migrazione qui sotto) invece di interrompere il ripristino
            if (buffer.length > MAX_FILE_SIZE_BYTES) {
              await this.minioService.uploadRaw(objectName, buffer, undefined, { keepName: true });
            } else {
              await this.minioService.uploadFile(objectName, buffer, undefined, { keepName: true });
            }
            filesUploaded++;
            totalSize += buffer.length;
          }
        }
      };
      await uploadDir(tempDir);
      if (filesUploaded === 0) {
        throw new BadRequestException('L\'archivio non contiene file');
      }
      this.logger.log(`[MinIO Restore] ${filesUploaded} file caricati (${totalSize} byte)`);
    } catch (error) {
      this.logger.error(`[MinIO Restore] Ripristino non riuscito dopo ${filesUploaded} file: ${error.message}`);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(`Ripristino dei file non riuscito: ${error.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    try {
      await this.storageMigration.run({ force: true, afterRestore: true });
    } catch (error) {
      this.logger.error(`[MinIO Restore] Migrazione dei file ripristinati non riuscita: ${error.message}`);
      throw new InternalServerErrorException(
        `File ripristinati (${filesUploaded}), ma la cifratura/rinomina dei file non è stata completata: ` +
          `${error.message}. Riprova il ripristino o riavvia l'app con FORCE_STORAGE_MIGRATION=true`,
      );
    }
    this.logger.log('[MinIO Restore] Ripristino dei file completato');
    return { restored: filesUploaded };
  }

  async createFullBackup(): Promise<{ database: BackupFileInfo; minio: BackupFileInfo }> {
    this.logger.log('Starting full backup (database + MinIO)');
    
    const database = await this.createDatabaseBackup();
    const minio = await this.createMinioBackup();
    
    this.logger.log('Full backup completed successfully');
    
    return { database, minio };
  }

  async listBackups(): Promise<Array<{
    filename: string;
    type: 'database' | 'minio';
    size: number;
    createdAt: Date;
  }>> {
    const files = fs.readdirSync(this.backupDir);
    
    return files
      .filter((f) => BACKUP_FILENAME.test(f))
      .map(filename => {
        const filePath = path.join(this.backupDir, filename);
        const stats = fs.statSync(filePath);
        
        return {
          filename,
          type: (filename.startsWith('db-backup') ? 'database' : 'minio') as 'database' | 'minio',
          size: stats.size,
          // birthtime non è affidabile su Linux/overlayfs (può valere 0)
          createdAt: stats.mtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Percorso di un backup esistente; rifiuta nomi che non sono backup dell'app. */
  private resolveBackupFile(filename: string): string {
    if (!BACKUP_FILENAME.test(filename)) {
      throw new BadRequestException('Nome del file di backup non valido');
    }
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Backup non trovato');
    }
    return filePath;
  }

  async deleteBackup(filename: string): Promise<void> {
    fs.unlinkSync(this.resolveBackupFile(filename));
    this.logger.log(`Backup deleted: ${filename}`);
  }

  async downloadBackup(filename: string): Promise<{ path: string; size: number }> {
    const filePath = this.resolveBackupFile(filename);
    return { path: filePath, size: fs.statSync(filePath).size };
  }
}
