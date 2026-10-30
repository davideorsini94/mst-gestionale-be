import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

/**
 * Nomi dei file di backup generati dall'app (niente percorsi: blocca ../ e simili): `backup` = manuale o di sicurezza
 * prima di un ripristino, `nightly` = automatico notturno.
 */
const BACKUP_FILENAME = /^(db|minio)-(backup|nightly)-[0-9TZ-]+\.(sql|tar)$/;

/** Origine di un backup, nel nome del file: solo i notturni ruotano, i manuali restano finché non si eliminano. */
type BackupKind = 'backup' | 'nightly';

/** Backup notturni conservati sulla macchina per tipo (database e file): dal sesto si elimina il più vecchio. */
export const MAX_BACKUPS_PER_TYPE = 5;

/**
 * Suffisso dei file in scrittura: diventano backup (elenco, conteggio, download) solo con la rinomina finale, così un
 * backup interrotto a metà (crash, disco pieno) non prende mai il posto di uno buono.
 */
const PARTIAL_SUFFIX = '.partial';

/** Avanzi di operazioni interrotte nella cartella dei backup (file parziali e cartelle temporanee). */
const LEFTOVER_ENTRY = /^(?:(?:db|minio)-(?:backup|nightly)-[0-9TZ-]+\.(?:sql|tar)\.partial|temp-[0-9TZ-]+|restore-[0-9TZ-]+|\.settings-\d+\.txt|\.nightly-backup-status\.json\.tmp)$/;

/**
 * Backup notturno: ogni notte alle 4, ora italiana (il container gira in UTC). Non tra le 2 e le 3: la notte del ritorno
 * all'ora solare la libreria cron farebbe partire il job delle 3 due volte.
 */
const NIGHTLY_BACKUP_CRON = '0 4 * * *';
const NIGHTLY_BACKUP_TIMEZONE = 'Europe/Rome';

/** Esito dell'ultimo backup notturno, accanto ai backup (non nel DB: un ripristino lo sovrascriverebbe). */
const NIGHTLY_STATUS_FILE = '.nightly-backup-status.json';

/**
 * Oltre questo tempo un pg_dump si considera bloccato e viene interrotto (la coda non resta ferma). Non vale per il
 * ripristino: interrompere un pg_restore lento lascerebbe il database a metà.
 */
const DUMP_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * Spazio libero richiesto prima di un backup, stimato dall'ultimo dello stesso tipo: il backup dei file passa da una
 * cartella temporanea e poi dal tar (circa il doppio). Il margine evita di riempire il disco di Postgres e MinIO.
 */
const SPACE_FACTOR = { db: 1.2, minio: 2.2 } as const;
const SPACE_MARGIN_BYTES = 512 * 1024 * 1024;

export interface NightlyBackupStatus {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  errors: string[];
  /** Ultima notte in cui database e file sono riusciti entrambi */
  lastSuccessAt: string | null;
}

/** Timestamp usato nei nomi dei backup (ordinabile come stringa: ISO in UTC a larghezza fissa). */
const fileStamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

/** Timestamp nel nome di un backup. */
const backupTimestamp = (filename: string) => filename.replace(/^(?:db|minio)-(?:backup|nightly)-/, '').replace(/\.(?:sql|tar)$/, '');

/**
 * Backup dal più recente al più vecchio secondo il timestamp nel nome. Quelli con un timestamp successivo a `now`
 * (orologio del server stato avanti, file copiati a mano) vanno in fondo: sono i primi a essere eliminati e non
 * contano come ultimo backup, altrimenti resterebbero per sempre e la rotazione lascerebbe un solo backup vero.
 */
const newestFirst = (filenames: string[], now: string): string[] => {
  const desc = (a: string, b: string) => backupTimestamp(b).localeCompare(backupTimestamp(a));
  const future = filenames.filter((f) => backupTimestamp(f) > now);
  return [...filenames.filter((f) => backupTimestamp(f) <= now).sort(desc), ...future.sort(desc)];
};

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
  /**
   * Coda delle operazioni su backup e ripristino: una alla volta. Il backup notturno non deve fare il dump mentre un
   * ripristino ha svuotato lo schema, né eliminare un backup mentre un altro lo sta scrivendo.
   */
  private queue: Promise<unknown> = Promise.resolve();
  /** Avvio del processo: senza nessun backup notturno riuscito, l'interfaccia avvisa se ne è passato troppo */
  private readonly processStartedAt = new Date().toISOString();

  constructor(
    private readonly minioService: MinioService,
    private readonly storageMigration: StorageEncryptionMigration,
  ) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true, mode: PRIVATE_DIR_MODE });
    }
    // all'avvio nessuna operazione è in corso: quello che resta è di un'esecuzione interrotta
    this.removeLeftovers();
  }

  /** Esegue l'operazione dopo quelle già in corso; un errore non blocca le successive. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
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
  private runProcess(
    bin: string,
    args: string[],
    io: { stdoutFile?: string; stdinFile?: string; timeoutMs?: number } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'postgres' },
        stdio: [io.stdinFile ? 'pipe' : 'ignore', io.stdoutFile ? 'pipe' : 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr!.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });

      // senza un limite un processo bloccato terrebbe ferma la coda dei backup fino al riavvio
      let timedOut = false;
      const timer = io.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, io.timeoutMs)
        : undefined;
      child.on('close', () => clearTimeout(timer));

      let output: fs.WriteStream | null = null;
      let outputDone: Promise<void> = Promise.resolve();
      if (io.stdoutFile) {
        output = fs.createWriteStream(io.stdoutFile, { mode: PRIVATE_FILE_MODE });
        outputDone = new Promise((res, rej) => {
          output!.on('finish', () => res());
          output!.on('error', (err) => {
            // disco pieno o cartella sparita: la pipe si stacca e il processo resterebbe bloccato sulla scrittura
            child.kill('SIGKILL');
            rej(err);
          });
        });
        outputDone.catch(() => undefined); // l'errore arriva con 'close'
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
            else if (timedOut) {
              reject(new Error(`${path.basename(bin)} interrotto: non ha finito entro ${io.timeoutMs! / 60_000} minuti`));
            } else reject(new Error(stderr.trim() || `${path.basename(bin)} terminato con codice ${code}`));
          })
          .catch(reject);
      });
    });
  }

  async createDatabaseBackup(): Promise<BackupFileInfo> {
    return this.exclusive(async () => publicInfo(await this.writeDatabaseBackup()));
  }

  /** Nuovo backup del database; se notturno, solo dopo che è completo si elimina il più vecchio oltre il limite. */
  private async writeDatabaseBackup(kind: BackupKind = 'backup'): Promise<BackupFile> {
    const timestamp = fileStamp();
    const filename = `db-${kind}-${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, filename);
    const partialPath = backupPath + PARTIAL_SUFFIX;
    const dbName = process.env.DB_DATABASE || 'mst_gestionale';

    this.logger.log(`Creating database backup: ${filename}`);
    const pgDump = this.findPgBinary('pg_dump');
    try {
      await this.assertFreeSpace('db');
      // formato "custom" (compresso), lo stesso letto dal ripristino
      await this.runProcess(pgDump, [...this.dbConnectionArgs(), '-F', 'c', '-b', dbName], {
        stdoutFile: partialPath,
        timeoutMs: DUMP_TIMEOUT_MS,
      });
      fs.chmodSync(partialPath, PRIVATE_FILE_MODE);
      const stats = fs.statSync(partialPath);
      if (stats.size === 0) throw new Error('il file di backup è vuoto');
      fs.renameSync(partialPath, backupPath);
      this.logger.log(`Database backup created successfully: ${filename} (${stats.size} bytes)`);
      if (kind === 'nightly') this.pruneOldNightlyBackups('db', filename);
      return { filename, path: backupPath, size: stats.size };
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
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
    return this.exclusive(() => this.doRestoreDatabaseBackup(backupPath));
  }

  private async doRestoreDatabaseBackup(backupPath: string): Promise<{ safetyBackup: string }> {
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
        // senza il backup di sicurezza il ritorno indietro svuoterebbe lo schema senza poterlo ricaricare
        if (!fs.existsSync(safety.path)) throw new Error(`backup di sicurezza ${safety.filename} non trovato`);
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
    return this.exclusive(async () => publicInfo(await this.writeMinioBackup()));
  }

  /** Nuovo backup dei file; se notturno, solo dopo che è completo si elimina il più vecchio oltre il limite. */
  private async writeMinioBackup(kind: BackupKind = 'backup'): Promise<BackupFile> {
    const timestamp = fileStamp();
    const filename = `minio-${kind}-${timestamp}.tar`;
    const backupPath = path.join(this.backupDir, filename);
    const partialPath = backupPath + PARTIAL_SUFFIX;
    const tempDir = path.join(this.backupDir, `temp-${timestamp}`);

    try {
      this.logger.log(`Creating MinIO backup: ${filename}`);
      await this.assertFreeSpace('minio');
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

      await execFileAsync('tar', ['-cf', partialPath, '-C', tempDir, '.']);
      fs.chmodSync(partialPath, PRIVATE_FILE_MODE);
      const stats = fs.statSync(partialPath);
      fs.renameSync(partialPath, backupPath);

      this.logger.log(`MinIO backup created successfully: ${filename} (${stats.size} bytes)`);
      if (kind === 'nightly') this.pruneOldNightlyBackups('minio', filename);
      return { filename, path: backupPath, size: stats.size };
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
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
    return this.exclusive(() => this.doRestoreMinioBackup(backupPath));
  }

  private async doRestoreMinioBackup(backupPath: string): Promise<{ restored: number }> {
    const timestamp = fileStamp();
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
    return this.exclusive(async () => {
      this.logger.log('Starting full backup (database + MinIO)');

      const database = publicInfo(await this.writeDatabaseBackup());
      const minio = publicInfo(await this.writeMinioBackup());

      this.logger.log('Full backup completed successfully');

      return { database, minio };
    });
  }

  /** Backup automatico attivo salvo BACKUP_AUTO_ENABLED=false/0/no/off (variabile d'ambiente del backend). */
  isNightlyBackupEnabled(): boolean {
    return !['false', '0', 'no', 'off'].includes((process.env.BACKUP_AUTO_ENABLED ?? '').trim().toLowerCase());
  }

  /** Stato del backup automatico per l'interfaccia (un fallimento notturno altrimenti resterebbe solo nei log). */
  getNightlyStatus(): {
    enabled: boolean;
    time: string;
    maxPerType: number;
    processStartedAt: string;
    last: NightlyBackupStatus | null;
  } {
    let last: NightlyBackupStatus | null = null;
    try {
      last = JSON.parse(fs.readFileSync(path.join(this.backupDir, NIGHTLY_STATUS_FILE), 'utf8'));
    } catch {
      // mai eseguito (o file illeggibile)
    }
    return {
      enabled: this.isNightlyBackupEnabled(),
      time: '04:00',
      maxPerType: MAX_BACKUPS_PER_TYPE,
      processStartedAt: this.processStartedAt,
      last,
    };
  }

  private writeNightlyStatus(status: NightlyBackupStatus): void {
    const target = path.join(this.backupDir, NIGHTLY_STATUS_FILE);
    try {
      // file temporaneo + rinomina: un riavvio a metà scrittura non lascia un file illeggibile
      fs.writeFileSync(`${target}.tmp`, JSON.stringify(status), { mode: PRIVATE_FILE_MODE });
      fs.renameSync(`${target}.tmp`, target);
    } catch (error) {
      this.logger.error(`[Backup notturno] Stato non salvato: ${error.message}`);
    }
  }

  /**
   * Backup completo notturno (database + file). Le due parti sono indipendenti: se una fallisce l'altra viene fatta
   * comunque. Ogni backup riuscito elimina il notturno più vecchio dello stesso tipo oltre MAX_BACKUPS_PER_TYPE (i
   * manuali non contano e non vengono toccati); uno fallito non elimina niente, così restano i backup precedenti.
   */
  @Cron(NIGHTLY_BACKUP_CRON, { name: 'nightly-backup', timeZone: NIGHTLY_BACKUP_TIMEZONE })
  async runNightlyBackup(): Promise<void> {
    if (!this.isNightlyBackupEnabled()) {
      return;
    }
    await this.exclusive(async () => {
      const startedAt = new Date().toISOString();
      this.logger.log('[Backup notturno] Avvio (database + file)');
      this.removeLeftovers();
      const parts: Array<[string, () => Promise<BackupFile>]> = [
        ['database', () => this.writeDatabaseBackup('nightly')],
        ['file', () => this.writeMinioBackup('nightly')],
      ];
      const errors: string[] = [];
      for (const [label, write] of parts) {
        try {
          await write();
        } catch (error) {
          errors.push(`Backup ${label}: ${error.message}`);
          this.logger.error(`[Backup notturno] Backup ${label} non riuscito: ${error.message}`);
        }
      }
      const finishedAt = new Date().toISOString();
      const ok = errors.length === 0;
      if (ok) this.logger.log('[Backup notturno] Completato');
      const lastSuccessAt = ok ? finishedAt : (this.getNightlyStatus().last?.lastSuccessAt ?? null);
      this.writeNightlyStatus({ startedAt, finishedAt, ok, errors, lastSuccessAt });
    });
  }

  /**
   * Tiene solo gli ultimi MAX_BACKUPS_PER_TYPE backup notturni del tipo indicato, compreso quello appena creato.
   * I backup manuali e quelli di sicurezza prima di un ripristino non contano e non vengono mai eliminati qui.
   * L'ordine è quello del timestamp nel nome (non la data del file, che una copia può cambiare), vedi newestFirst.
   * Un errore qui non fa fallire il backup appena creato.
   */
  private pruneOldNightlyBackups(type: 'db' | 'minio', justCreated: string): void {
    try {
      const prefix = `${type}-nightly-`;
      // quello appena creato resta sempre; quelli "nel futuro" rispetto a lui sono i primi a essere eliminati
      const others = fs
        .readdirSync(this.backupDir)
        .filter((f) => BACKUP_FILENAME.test(f) && f.startsWith(prefix) && f !== justCreated);
      const excess = newestFirst(others, backupTimestamp(justCreated)).slice(MAX_BACKUPS_PER_TYPE - 1);
      for (const filename of excess) {
        fs.rmSync(path.join(this.backupDir, filename), { force: true });
        this.logger.log(`Backup notturno eliminato (oltre i ${MAX_BACKUPS_PER_TYPE} più recenti): ${filename}`);
      }
    } catch (error) {
      this.logger.error(`Eliminazione dei backup vecchi non riuscita: ${error.message}`);
    }
  }

  /**
   * Rifiuta il backup se lo spazio libero non basta: meglio un backup fallito e segnalato che un disco pieno che
   * blocca anche Postgres e MinIO. Stima: per il database l'ultimo dump, per i file la dimensione attuale del bucket.
   */
  private async assertFreeSpace(type: 'db' | 'minio'): Promise<void> {
    let size = 0;
    if (type === 'minio') {
      size = await this.minioService.bucketSize();
    } else {
      const dumps = fs.readdirSync(this.backupDir).filter((f) => BACKUP_FILENAME.test(f) && f.startsWith('db-'));
      const latest = newestFirst(dumps, fileStamp())[0];
      if (latest) size = fs.statSync(path.join(this.backupDir, latest)).size;
    }
    const estimate = size * SPACE_FACTOR[type];
    const required = estimate + SPACE_MARGIN_BYTES;
    const { bavail, bsize } = fs.statfsSync(this.backupDir);
    const free = bavail * bsize;
    if (free < required) {
      const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
      throw new Error(`spazio su disco insufficiente (liberi ${mb(free)}, servono circa ${mb(required)})`);
    }
  }

  /**
   * Toglie i resti di operazioni interrotte (riavvio a metà backup): occupano spazio e non sono backup validi.
   * Va chiamata dentro exclusive(), quando nessuna operazione sta usando quei file.
   */
  private removeLeftovers(): void {
    try {
      for (const entry of fs.readdirSync(this.backupDir)) {
        if (!LEFTOVER_ENTRY.test(entry)) continue;
        fs.rmSync(path.join(this.backupDir, entry), { recursive: true, force: true });
        this.logger.warn(`Rimosso un resto di un'operazione interrotta: ${entry}`);
      }
    } catch (error) {
      this.logger.error(`Pulizia della cartella dei backup non riuscita: ${error.message}`);
    }
  }

  async listBackups(): Promise<Array<{
    filename: string;
    type: 'database' | 'minio';
    /** true = backup notturno (ruota), false = manuale o di sicurezza (resta finché non si elimina) */
    automatic: boolean;
    size: number;
    createdAt: Date;
  }>> {
    const files = fs.readdirSync(this.backupDir).filter((f) => BACKUP_FILENAME.test(f));
    const order = newestFirst(files, fileStamp());

    return files
      .map(filename => {
        const filePath = path.join(this.backupDir, filename);
        const stats = fs.statSync(filePath);
        
        return {
          filename,
          type: (filename.startsWith('db-') ? 'database' : 'minio') as 'database' | 'minio',
          automatic: filename.includes('-nightly-'),
          size: stats.size,
          // birthtime non è affidabile su Linux/overlayfs (può valere 0)
          createdAt: stats.mtime,
        };
      })
      // ordine della rotazione (timestamp nel nome): in cima i più recenti
      .sort((a, b) => order.indexOf(a.filename) - order.indexOf(b.filename));
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
    await this.exclusive(async () => {
      fs.unlinkSync(this.resolveBackupFile(filename));
      this.logger.log(`Backup deleted: ${filename}`);
    });
  }

  async downloadBackup(filename: string): Promise<{ path: string; size: number }> {
    const filePath = this.resolveBackupFile(filename);
    return { path: filePath, size: fs.statSync(filePath).size };
  }
}
