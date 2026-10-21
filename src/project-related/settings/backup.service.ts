import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { MAX_FILE_SIZE_BYTES, MinioService } from 'src/minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { StorageEncryptionMigration } from '../../minio/storage-encryption.migration';
import { keyCheckMatches } from '../../common/crypto/field-crypto';
import { KEY_CHECK_SETTING } from '../../migrations/1760900001000-EncryptSensitiveData';

const execAsync = promisify(exec);

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
      fs.mkdirSync(this.backupDir, { recursive: true });
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
        output = fs.createWriteStream(io.stdoutFile);
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

  async createDatabaseBackup(): Promise<{ filename: string; path: string; size: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, filename);
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';

    this.logger.log(`Creating database backup: ${filename}`);
    const pgDump = this.findPgBinary('pg_dump');
    try {
      // formato "custom" (compresso), lo stesso letto dal ripristino
      await this.runProcess(pgDump, [...this.dbConnectionArgs(), '-F', 'c', '-b', dbName], { stdoutFile: backupPath });
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

  async restoreDatabaseBackup(backupPath: string): Promise<void> {
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';
    const pgRestore = this.findPgBinary('pg_restore');

    try {
      this.logger.log(`Restoring database from: ${backupPath}`);

      // Il file deve essere un archivio leggibile PRIMA di toccare il database
      try {
        await this.runProcess(pgRestore, ['--list'], { stdinFile: backupPath });
      } catch {
        throw new BadRequestException('Il file non è un backup del database valido: nessuna modifica effettuata');
      }

      // Schema pulito prima del restore: con "-c" la tabella migrations della versione attuale sopravviverebbe a un
      // dump di una versione precedente (le migrazioni risulterebbero eseguite su dati non migrati).
      await dataSource.query('DROP SCHEMA public CASCADE');
      await dataSource.query('CREATE SCHEMA public');
      await this.runProcess(pgRestore, [...this.dbConnectionArgs(), '-d', dbName, '--no-owner'], {
        stdinFile: backupPath,
      });

      // Porta il DB ripristinato alla versione attuale (cifratura compresa) e allinea i file
      const executed = await dataSource.runMigrations({ transaction: 'each' });
      this.logger.log(`Migrazioni eseguite dopo il restore: ${executed.map((m) => m.name).join(', ') || 'nessuna'}`);
      // Un backup cifrato con altre chiavi renderebbe i dati illeggibili (e mescolati con i nuovi)
      const check = await dataSource.query(`SELECT value FROM settings WHERE key = $1`, [KEY_CHECK_SETTING]);
      if (!check.length || !keyCheckMatches(check[0].value)) {
        throw new Error(
          'Il backup ripristinato è cifrato con chiavi diverse da quelle attuali: ripristina un backup compatibile',
        );
      }
      await this.storageMigration.run();

      this.logger.log('Database restore completed successfully');
    } catch (error) {
      this.logger.error(`Failed to restore database: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(`Ripristino del database non riuscito: ${error.message}`);
    }
  }

  async createMinioBackup(): Promise<{ filename: string; path: string; size: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `minio-backup-${timestamp}.tar`;
    const backupPath = path.join(this.backupDir, filename);
    const bucketName = process.env.MINIO_BUCKET || 'bucket';

    try {
      this.logger.log(`Creating MinIO backup: ${filename}`);
      
      const tempDir = path.join(this.backupDir, `temp-${timestamp}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const objectNames = await this.minioService.listFiles();

      this.logger.log(`Found ${objectNames.length} objects in MinIO bucket`);

      for (const objectName of objectNames) {
        const objectPath = path.join(tempDir, objectName);
        const objectDir = path.dirname(objectPath);
        
        if (!fs.existsSync(objectDir)) {
          fs.mkdirSync(objectDir, { recursive: true });
        }

        // Byte così come sono su MinIO: il backup resta cifrato (serve la chiave dell'app per leggerlo)
        fs.writeFileSync(objectPath, await this.minioService.getRawBuffer(objectName));
      }

      const tarCommand = `tar -cf "${backupPath}" -C "${tempDir}" .`;
      await execAsync(tarCommand);

      await execAsync(`rm -rf "${tempDir}"`);

      const stats = fs.statSync(backupPath);
      
      this.logger.log(`MinIO backup created successfully: ${filename} (${stats.size} bytes)`);
      
      return {
        filename,
        path: backupPath,
        size: stats.size,
      };
    } catch (error) {
      this.logger.error(`Failed to create MinIO backup: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Backup dei file non riuscito: ${error.message}`);
    }
  }

  async restoreMinioBackup(backupPath: string): Promise<void> {
    const bucketName = process.env.MINIO_BUCKET || 'bucket';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let tempDir: string | null = null;

    try {
      this.logger.log(`[MinIO Restore] Starting restore from: ${backupPath}`);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      tempDir = path.join(this.backupDir, `restore-${timestamp}`);
      fs.mkdirSync(tempDir, { recursive: true });
      this.logger.log(`[MinIO Restore] Created temp directory: ${tempDir}`);

      this.logger.log(`[MinIO Restore] Extracting tar archive...`);
      const tarCommand = `tar -xf "${backupPath}" -C "${tempDir}"`;
      const { stdout, stderr } = await execAsync(tarCommand);
      if (stderr) {
        this.logger.warn(`[MinIO Restore] Tar extraction warnings: ${stderr}`);
      }
      this.logger.log(`[MinIO Restore] Tar extraction completed`);

      const extractedFiles = fs.readdirSync(tempDir);
      this.logger.log(`[MinIO Restore] Found ${extractedFiles.length} items in extracted archive: ${extractedFiles.join(', ')}`);

      if (extractedFiles.length === 0) {
        throw new Error('No files found in backup archive');
      }

      let filesUploaded = 0;
      let totalSize = 0;

      const uploadFiles = async (dir: string, prefix: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        this.logger.log(`[MinIO Restore] Processing directory: ${dir} (${entries.length} entries)`);

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            this.logger.log(`[MinIO Restore] Entering subdirectory: ${objectName}`);
            await uploadFiles(fullPath, objectName);
          } else {
            try {
              const buffer = fs.readFileSync(fullPath);
              this.logger.log(`[MinIO Restore] Uploading file: ${objectName} (${buffer.length} bytes)`);
              // uploadFile non ricifra i file già cifrati e cifra quelli di backup vecchi in chiaro
              if (buffer.length > MAX_FILE_SIZE_BYTES) {
                // file oltre il limite dell'app: si carica così com'è invece di interrompere il restore
                await this.minioService.uploadRaw(objectName, buffer);
              } else {
                await this.minioService.uploadFile(objectName, buffer);
              }
              filesUploaded++;
              totalSize += buffer.length;
              this.logger.log(`[MinIO Restore] ✓ Restored object ${filesUploaded}: ${objectName}`);
            } catch (uploadError) {
              this.logger.error(`[MinIO Restore] Failed to upload ${objectName}: ${uploadError.message}`);
              throw uploadError;
            }
          }
        }
      };

      this.logger.log(`[MinIO Restore] Starting file upload to MinIO bucket: ${bucketName}`);
      await uploadFiles(tempDir);

      this.logger.log(`[MinIO Restore] Cleaning up temp directory: ${tempDir}`);
      await execAsync(`rm -rf "${tempDir}"`);

      this.logger.log(`[MinIO Restore] ✓ MinIO restore completed successfully: ${filesUploaded} files uploaded (${totalSize} bytes total)`);
    } catch (error) {
      this.logger.error(`[MinIO Restore] ✗ Failed to restore MinIO: ${error.message}`, error.stack);
      
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          this.logger.log(`[MinIO Restore] Cleaning up temp directory after error: ${tempDir}`);
          await execAsync(`rm -rf "${tempDir}"`);
        } catch (cleanupError) {
          this.logger.error(`[MinIO Restore] Failed to cleanup temp directory: ${cleanupError.message}`);
        }
      }
      
      throw new InternalServerErrorException(`Ripristino dei file non riuscito: ${error.message}`);
    }
  }

  async createFullBackup(): Promise<{
    database: { filename: string; path: string; size: number };
    minio: { filename: string; path: string; size: number };
  }> {
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
