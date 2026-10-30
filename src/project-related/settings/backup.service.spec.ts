import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupService, MAX_BACKUPS_PER_TYPE } from './backup.service';

jest.mock('../../datasources/data-source', () => ({ dataSource: {} }));

/** MinIO in memoria: solo quello che usa il backup dei file. */
class FakeMinio {
  objects = new Map<string, Buffer>([['ricevute/a.pdf', Buffer.from('a')]]);
  failList = false;
  async listFiles() {
    if (this.failList) throw new Error('connect ECONNREFUSED');
    return [...this.objects.keys()];
  }
  assertSafeObjectName() {}
  async bucketSize() {
    return [...this.objects.values()].reduce((n, b) => n + b.length, 0);
  }
  async getRawBuffer(name: string) {
    return this.objects.get(name)!;
  }
}

const nextNight = () => jest.setSystemTime(Date.now() + 86_400_000);

const stamp = (day: number) => `2026-10-${String(day).padStart(2, '0')}T02-00-00-000Z`;

describe('BackupService: backup notturno e limite di backup sulla macchina', () => {
  let dir: string;
  let minio: FakeMinio;
  let service: BackupService;
  /** pg_dump finto: scrive il contenuto indicato su stdout (vuoto = backup non valido) o fallisce. */
  let dumpOutcome: { content?: string; error?: Error };

  /** Contenuto della cartella dei backup, senza il file con l'esito del notturno */
  const files = () => fs.readdirSync(dir).filter((f) => f !== '.nightly-backup-status.json').sort();
  const touch = (name: string, content = 'x') => fs.writeFileSync(path.join(dir, name), content);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mst-backup-spec-'));
    process.env.BACKUP_DIR = dir;
    delete process.env.BACKUP_AUTO_ENABLED;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    minio = new FakeMinio();
    service = new BackupService(minio as any, {} as any);
    dumpOutcome = { content: 'PGDMP' };
    (service as any).findPgBinary = () => '/usr/bin/pg_dump';
    (service as any).runProcess = async (_bin: string, _args: string[], io: { stdoutFile?: string }) => {
      if (dumpOutcome.error) throw dumpOutcome.error;
      fs.writeFileSync(io.stdoutFile!, dumpOutcome.content ?? '');
    };

    // solo l'orologio è finto (timer e I/O veri): ogni test parte dal 1/11, nextNight() avanza di un giorno
    jest.useFakeTimers({
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate',
        'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    jest.setSystemTime(new Date('2026-11-01T02:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.BACKUP_AUTO_ENABLED;
  });

  it('dal sesto backup notturno si elimina il più vecchio: restano gli ultimi 5 di database e 5 di file', async () => {
    for (let i = 0; i < 7; i++) {
      nextNight();
      await service.runNightlyBackup();
    }

    const db = files().filter((f) => f.startsWith('db-nightly-'));
    const tar = files().filter((f) => f.startsWith('minio-nightly-'));
    expect(db).toHaveLength(MAX_BACKUPS_PER_TYPE);
    expect(tar).toHaveLength(MAX_BACKUPS_PER_TYPE);
    expect(files()).toHaveLength(2 * MAX_BACKUPS_PER_TYPE); // niente file temporanei rimasti

    // sono i 5 più recenti (notti dal 4/11 all'8/11 delle 7 eseguite dal 2/11)
    const list = await service.listBackups();
    expect(list.filter((b) => b.type === 'database').map((b) => b.filename)).toEqual([...db].reverse());
    expect(list.every((b) => b.automatic)).toBe(true);
    expect(db[0]).toContain('2026-11-04');
  });

  it('i backup manuali non contano nel limite: non vengono mai eliminati e non ne fanno eliminare', async () => {
    for (let day = 1; day <= 5; day++) touch(`db-nightly-${stamp(day)}.sql`);
    for (let day = 1; day <= 7; day++) touch(`db-backup-${stamp(day)}.sql`);

    // un manuale in più (anche oltre 5): i notturni restano tutti
    const manual = await service.createDatabaseBackup();
    expect(files().filter((f) => f.startsWith('db-nightly-'))).toHaveLength(5);
    expect(files().filter((f) => f.startsWith('db-backup-'))).toHaveLength(8);
    expect((await service.listBackups()).find((b) => b.filename === manual.filename)?.automatic).toBe(false);

    // un notturno in più: esce il notturno più vecchio, i manuali restano tutti
    nextNight();
    await service.runNightlyBackup();
    const nightly = files().filter((f) => f.startsWith('db-nightly-'));
    expect(nightly).toHaveLength(MAX_BACKUPS_PER_TYPE);
    expect(nightly).not.toContain(`db-nightly-${stamp(1)}.sql`);
    expect(files().filter((f) => f.startsWith('db-backup-'))).toHaveLength(8);
  });

  it('i notturni ruotano per timestamp nel nome, non per data del file', async () => {
    for (let day = 1; day <= 5; day++) touch(`db-nightly-${stamp(day)}.sql`);
    // mtime alterato (es. copia): non deve contare
    fs.utimesSync(path.join(dir, `db-nightly-${stamp(1)}.sql`), new Date(2030, 0, 1), new Date(2030, 0, 1));

    await service.runNightlyBackup();

    const db = files().filter((f) => f.startsWith('db-nightly-'));
    expect(db).toHaveLength(MAX_BACKUPS_PER_TYPE);
    expect(db).not.toContain(`db-nightly-${stamp(1)}.sql`);
  });

  it('un backup non riuscito non elimina nessun backup precedente e non lascia file parziali', async () => {
    for (let day = 1; day <= 5; day++) {
      touch(`db-nightly-${stamp(day)}.sql`);
      touch(`minio-nightly-${stamp(day)}.tar`);
    }
    const before = files();

    dumpOutcome = { content: '' }; // pg_dump "riuscito" ma file vuoto
    minio.failList = true;
    await service.runNightlyBackup();
    expect(files()).toEqual(before);

    dumpOutcome = { error: new Error('connection refused') };
    await expect(service.createDatabaseBackup()).rejects.toThrow('connection refused');
    expect(files()).toEqual(before);
  });

  it('se il database fallisce, il backup notturno dei file viene fatto comunque', async () => {
    dumpOutcome = { error: new Error('pg down') };
    await service.runNightlyBackup();

    expect(files().filter((f) => f.startsWith('db-nightly-'))).toHaveLength(0);
    expect(files().filter((f) => f.startsWith('minio-nightly-'))).toHaveLength(1);
  });

  it('con BACKUP_AUTO_ENABLED=false il backup notturno non fa niente', async () => {
    process.env.BACKUP_AUTO_ENABLED = 'false';
    await service.runNightlyBackup();
    expect(files()).toEqual([]);
  });

  it('un backup in scrittura (file .partial) non compare nell\'elenco e non si può scaricare', async () => {
    touch(`db-backup-${stamp(1)}.sql.partial`);
    expect(await service.listBackups()).toEqual([]);
    await expect(service.downloadBackup(`db-backup-${stamp(1)}.sql.partial`)).rejects.toThrow();
  });

  it('il backup notturno toglie i resti di operazioni interrotte, non i backup', async () => {
    touch(`db-backup-${stamp(1)}.sql`);
    touch(`db-backup-${stamp(2)}.sql.partial`);
    touch(`minio-backup-${stamp(2)}.tar.partial`);
    fs.mkdirSync(path.join(dir, `temp-${stamp(2)}`));
    fs.mkdirSync(path.join(dir, `restore-${stamp(2)}`));
    touch('.settings-123.txt');
    touch('appunti.txt'); // non è dell'app: resta

    await service.runNightlyBackup();

    const remaining = files();
    expect(remaining).toContain(`db-backup-${stamp(1)}.sql`);
    expect(remaining).toContain('appunti.txt');
    expect(remaining.filter((f) => /partial|^temp-|^restore-|^\.settings-/.test(f))).toEqual([]);
  });

  it('il backup notturno aspetta la fine di un ripristino in corso (niente dump a schema svuotato)', async () => {
    let finishRestore!: () => void;
    const order: string[] = [];
    (service as any).doRestoreDatabaseBackup = () =>
      new Promise<void>((resolve) => {
        order.push('restore:start');
        finishRestore = () => {
          order.push('restore:end');
          resolve();
        };
      });
    const write = (service as any).writeDatabaseBackup.bind(service);
    (service as any).writeDatabaseBackup = () => {
      order.push('backup:db');
      return write();
    };

    const restore = service.restoreDatabaseBackup('/tmp/caricato');
    const nightly = service.runNightlyBackup();
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['restore:start']);

    finishRestore();
    await Promise.all([restore, nightly]);
    expect(order).toEqual(['restore:start', 'restore:end', 'backup:db']);
  });

  it('file con timestamp nel futuro (orologio sbagliato) sono i primi a essere eliminati, non i backup veri', async () => {
    for (let day = 1; day <= 5; day++) touch(`db-nightly-2099-01-0${day}T02-00-00-000Z.sql`);

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      nextNight();
      created.push((await (service as any).writeDatabaseBackup('nightly')).filename);
    }

    // dopo 5 backup veri i file "dal futuro" sono spariti tutti, e i backup veri sono in cima all'elenco
    expect(files().filter((f) => f.startsWith('db-nightly-')).sort()).toEqual([...created].sort());

    touch('db-nightly-2099-01-01T02-00-00-000Z.sql');
    expect((await service.listBackups()).map((b) => b.filename)).toEqual([
      ...[...created].reverse(),
      'db-nightly-2099-01-01T02-00-00-000Z.sql',
    ]);
  });

  it('il backup completo manuale non si blocca in coda e non elimina nessun notturno', async () => {
    for (let day = 1; day <= 5; day++) {
      touch(`db-nightly-${stamp(day)}.sql`);
      touch(`minio-nightly-${stamp(day)}.tar`);
    }
    const before = files();
    const { database, minio: tar } = await service.createFullBackup();
    expect(database.filename).toMatch(/^db-backup-/);
    expect(tar.filename).toMatch(/^minio-backup-/);
    expect(files()).toEqual([...before, database.filename, tar.filename].sort());
  });

  it('l\'elenco segue l\'ordine della rotazione (timestamp nel nome), non la data del file', async () => {
    touch(`db-backup-${stamp(1)}.sql`);
    touch(`db-backup-${stamp(2)}.sql`);
    fs.utimesSync(path.join(dir, `db-backup-${stamp(1)}.sql`), new Date(2030, 0, 1), new Date(2030, 0, 1));
    expect((await service.listBackups()).map((b) => b.filename)).toEqual([
      `db-backup-${stamp(2)}.sql`,
      `db-backup-${stamp(1)}.sql`,
    ]);
  });

  it('con poco spazio su disco il backup viene rifiutato prima di scrivere e non elimina niente', async () => {
    for (let day = 1; day <= 5; day++) touch(`db-backup-${stamp(day)}.sql`);
    const before = files();
    jest.spyOn(fs, 'statfsSync').mockReturnValue({ bavail: 10, bsize: 4096 } as any);

    await expect(service.createDatabaseBackup()).rejects.toThrow('spazio su disco insufficiente');
    expect(files()).toEqual(before);
  });

  it('l\'esito del backup notturno resta salvato: riuscito, poi fallito con l\'ultima riuscita', async () => {
    expect(service.getNightlyStatus()).toMatchObject({ enabled: true, maxPerType: MAX_BACKUPS_PER_TYPE, last: null });

    await service.runNightlyBackup();
    const ok = service.getNightlyStatus().last!;
    expect(ok).toMatchObject({ ok: true, errors: [] });
    expect(ok.lastSuccessAt).toBe(ok.finishedAt);

    nextNight();
    minio.failList = true;
    await service.runNightlyBackup();
    const failed = service.getNightlyStatus().last!;
    expect(failed.ok).toBe(false);
    expect(failed.errors).toEqual([expect.stringContaining('Backup file')]);
    expect(failed.lastSuccessAt).toBe(ok.finishedAt);
  });

  it('spazio insufficiente: il backup notturno risulta non riuscito con il motivo (avviso agli admin)', async () => {
    jest.spyOn(fs, 'statfsSync').mockReturnValue({ bavail: 10, bsize: 4096 } as any);
    await service.runNightlyBackup();

    expect(service.getNightlyStatus().last).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('spazio su disco insufficiente'), expect.stringContaining('spazio su disco insufficiente')],
      lastSuccessAt: null,
    });
    expect(files()).toEqual([]);
  });

  it.each(['false', 'FALSE', '0', 'no', 'off'])('BACKUP_AUTO_ENABLED=%s spegne il backup notturno', (value) => {
    process.env.BACKUP_AUTO_ENABLED = value;
    expect(service.isNightlyBackupEnabled()).toBe(false);
  });

  it('un errore di scrittura del dump interrompe il processo invece di bloccare la coda', async () => {
    const realRunProcess = BackupService.prototype['runProcess'].bind(service);
    // `yes` scrive all'infinito: senza kill sull'errore dello stream resterebbe bloccato sulla pipe
    const out = path.join(dir, 'cartella-inesistente', 'dump');
    await expect(realRunProcess('/usr/bin/yes', [], { stdoutFile: out })).rejects.toThrow(/ENOENT/);
  }, 5000);

  it('un pg_dump che non finisce entro il limite viene interrotto con un messaggio chiaro', async () => {
    const realRunProcess = BackupService.prototype['runProcess'].bind(service);
    const out = path.join(dir, 'dump');
    await expect(realRunProcess('/bin/sleep', ['10'], { stdoutFile: out, timeoutMs: 100 })).rejects.toThrow(
      'sleep interrotto',
    );
  }, 5000);

  it('lo stato riporta l\'avvio del processo (avviso in interfaccia se il notturno non parte mai)', () => {
    const { processStartedAt } = service.getNightlyStatus();
    expect(new Date(processStartedAt).toISOString()).toBe(processStartedAt);
  });

  it('un\'operazione fallita non blocca le successive in coda', async () => {
    dumpOutcome = { error: new Error('pg down') };
    await expect(service.createDatabaseBackup()).rejects.toThrow();
    dumpOutcome = { content: 'PGDMP' };
    nextNight();
    await expect(service.createDatabaseBackup()).resolves.toMatchObject({ size: 5 });
  });
});
