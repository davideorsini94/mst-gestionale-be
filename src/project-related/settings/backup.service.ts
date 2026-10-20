import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { MAX_FILE_SIZE_BYTES, MinioService } from 'src/minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { StorageEncryptionMigration } from '../../minio/storage-encryption.migration';
import { keyCheckMatches } from '../../common/crypto/field-crypto';
import { KEY_CHECK_SETTING } from '../../migrations/1760900001000-EncryptSensitiveData';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = path.join(process.cwd(), 'backups');

  constructor(
    private readonly minioService: MinioService,
    private readonly storageMigration: StorageEncryptionMigration,
  ) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private async checkPgDumpAvailable(): Promise<boolean> {
    try {
      await execAsync('which pg_dump');
      return true;
    } catch {
      return false;
    }
  }

  private async checkPgRestoreAvailable(): Promise<boolean> {
    try {
      await execAsync('which pg_restore');
      return true;
    } catch {
      return false;
    }
  }

  async createDatabaseBackup(): Promise<{ filename: string; path: string; size: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-backup-${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, filename);

    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const dbUser = process.env.DB_USERNAME || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';

    try {
      this.logger.log(`Creating database backup: ${filename}`);
      
      const isAvailable = await this.checkPgDumpAvailable();
      if (!isAvailable) {
        throw new Error(
          'PostgreSQL client tools not found. Please install PostgreSQL client tools:\n' +
          'macOS: brew install postgresql@16\n' +
          'Ubuntu/Debian: sudo apt-get install postgresql-client\n' +
          'Or ensure pg_dump is in your PATH'
        );
      }
      
      const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -F c -b -v -f "${backupPath}" ${dbName}`;
      
      await execAsync(command);
      
      const stats = fs.statSync(backupPath);
      
      this.logger.log(`Database backup created successfully: ${filename} (${stats.size} bytes)`);
      
      return {
        filename,
        path: backupPath,
        size: stats.size,
      };
    } catch (error) {
      this.logger.error(`Failed to create database backup: ${error.message}`, error.stack);
      throw new Error(`Database backup failed: ${error.message}`);
    }
  }

  async restoreDatabaseBackup(backupPath: string): Promise<void> {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const dbUser = process.env.DB_USERNAME || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';

    try {
      this.logger.log(`Restoring database from: ${backupPath}`);
      
      const isAvailable = await this.checkPgRestoreAvailable();
      if (!isAvailable) {
        throw new Error(
          'PostgreSQL client tools not found. Please install PostgreSQL client tools:\n' +
          'macOS: brew install postgresql@16\n' +
          'Ubuntu/Debian: sudo apt-get install postgresql-client\n' +
          'Or ensure pg_restore is in your PATH'
        );
      }
      
      // Il file deve essere un archivio leggibile PRIMA di toccare il database
      try {
        await execAsync(`pg_restore --list "${backupPath}" > /dev/null`);
      } catch {
        throw new Error('Il file non è un backup del database valido: nessuna modifica effettuata');
      }

      // Schema pulito prima del restore: con "-c" la tabella migrations della versione attuale sopravviverebbe a un
      // dump di una versione precedente (le migrazioni risulterebbero eseguite su dati non migrati).
      await dataSource.query('DROP SCHEMA public CASCADE');
      await dataSource.query('CREATE SCHEMA public');
      const command = `PGPASSWORD="${dbPassword}" pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --no-owner -v "${backupPath}"`;

      await execAsync(command);

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
      throw new Error(`Database restore failed: ${error.message}`);
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
      throw new Error(`MinIO backup failed: ${error.message}`);
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
      
      throw new Error(`MinIO restore failed: ${error.message}`);
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
      .filter(f => f.endsWith('.sql') || f.endsWith('.tar'))
      .map(filename => {
        const filePath = path.join(this.backupDir, filename);
        const stats = fs.statSync(filePath);
        
        return {
          filename,
          type: (filename.startsWith('db-backup') ? 'database' : 'minio') as 'database' | 'minio',
          size: stats.size,
          createdAt: stats.birthtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = path.join(this.backupDir, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }

    if (!filePath.startsWith(this.backupDir)) {
      throw new Error('Invalid backup path');
    }

    fs.unlinkSync(filePath);
    this.logger.log(`Backup deleted: ${filename}`);
  }

  async downloadBackup(filename: string): Promise<{ path: string; size: number }> {
    const filePath = path.join(this.backupDir, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }

    if (!filePath.startsWith(this.backupDir)) {
      throw new Error('Invalid backup path');
    }

    const stats = fs.statSync(filePath);
    
    return {
      path: filePath,
      size: stats.size,
    };
  }
}
