import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { decryptFile, encryptFile, isEncryptedFile, resetKeysForTests } from '../common/crypto/field-crypto';
import {
  hasOpaqueName,
  Reference,
  StorageEncryptionMigration,
  StorageMigrationStore,
  unlinkedObjectName,
} from './storage-encryption.migration';
import { MinioService } from './minio.service';

jest.mock('../datasources/data-source', () => ({ dataSource: {} }));

const RECEIPT_UUID = '11111111-1111-4111-8111-111111111111';
const FILE_UUID = '22222222-2222-4222-8222-222222222222';

/** MinIO in memoria con gli stessi comportamenti usati dalla migrazione. */
class FakeMinio {
  objects = new Map<string, Buffer>();
  failStat = false;

  sanitizePath = (p: string) => MinioService.prototype.sanitizePath.call(null, p);
  async ensureBucket() {}
  async fileExists(name: string) {
    if (this.failStat) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    return this.objects.has(name);
  }
  async getRawBuffer(name: string) {
    const b = this.objects.get(name);
    if (!b) throw Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' });
    return b;
  }
  async uploadRaw(name: string, buffer: Buffer, _ct?: string, opts: { keepName?: boolean } = {}) {
    const finalName = opts.keepName ? name : this.sanitizePath(name);
    this.objects.set(finalName, buffer);
    return finalName;
  }
  async deleteFile(name: string) {
    this.objects.delete(name);
  }
  async listFiles() {
    return Array.from(this.objects.keys());
  }
}

/** DB in memoria: righe di transactions e files con il loro percorso. */
class FakeStore extends StorageMigrationStore {
  done = false;
  receipts: { uuid: string; path: string; year: number | null }[] = [];
  files: { uuid: string; path: string; name: string | null }[] = [];
  extraReferenced: string[] = [];

  async isDone() {
    return this.done;
  }
  async markDone() {
    this.done = true;
  }
  async loadReceipts() {
    return this.receipts.map((r) => ({ ...r }));
  }
  async loadFiles() {
    return this.files.map((f) => ({ ...f }));
  }
  async referencedPaths() {
    return new Set([...this.receipts.map((r) => r.path), ...this.files.map((f) => f.path), ...this.extraReferenced]);
  }
  async isStillReferenced(name: string) {
    return (await this.referencedPaths()).has(name);
  }
  async compareAndSwap(ref: Reference, target: string) {
    const rows: { uuid: string; path: string }[] = ref.table === 'transactions' ? this.receipts : this.files;
    const row = rows.find((r) => r.uuid === ref.uuid && r.path === ref.currentPath);
    if (!row) return false;
    row.path = target;
    return true;
  }
}

const setup = () => {
  const minio = new FakeMinio();
  const store = new FakeStore();
  const migration = new StorageEncryptionMigration(minio as unknown as MinioService);
  migration.store = store;
  return { minio, store, migration };
};

describe('StorageEncryptionMigration', () => {
  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.DATA_HASH_KEY = randomBytes(32).toString('base64');
    delete process.env.ALLOW_MISSING_FILES;
    delete process.env.FORCE_STORAGE_MIGRATION;
    resetKeysForTests();
  });

  it('cifra e rinomina un file referenziato, poi cancella il vecchio', async () => {
    const { minio, store, migration } = setup();
    const old = 'ricevute/2025/12-Mario_Rossi_RSSMRA80A01F205X.pdf';
    minio.objects.set(old, Buffer.from('%PDF ricevuta'));
    store.receipts.push({ uuid: RECEIPT_UUID, path: old, year: 2025 });

    const report = await migration.run();

    const target = `ricevute/2025/${RECEIPT_UUID}.pdf`;
    expect(report!.moved).toBe(1);
    expect(store.receipts[0].path).toBe(target);
    expect(minio.objects.has(old)).toBe(false);
    expect(isEncryptedFile(minio.objects.get(target)!)).toBe(true);
    expect(decryptFile(minio.objects.get(target)!).toString()).toBe('%PDF ricevuta');
  });

  it('è idempotente: alla seconda esecuzione non riscrive i file già migrati', async () => {
    const { minio, store, migration } = setup();
    minio.objects.set('ricevute/2025/1-Nome.pdf', Buffer.from('a'));
    store.receipts.push({ uuid: RECEIPT_UUID, path: 'ricevute/2025/1-Nome.pdf', year: 2025 });
    await migration.run();
    const snapshot = new Map(minio.objects);

    const second = await migration.run({ force: true });
    expect(second!.alreadyDone).toBe(1);
    expect(second!.moved).toBe(0);
    for (const [k, v] of snapshot) expect(minio.objects.get(k)).toBe(v);
    expect(minio.objects.size).toBe(snapshot.size);
  });

  it('sposta i file non referenziati con nome personale in non-collegati/ (cifrati, nome opaco)', async () => {
    const { minio, migration } = setup();
    const orphan = 'ricevute/2025/1525-Nome Cognome_CF_20251203.pdf';
    minio.objects.set(orphan, Buffer.from('orfano'));

    const report = await migration.run();

    const dest = unlinkedObjectName(orphan);
    expect(dest).toMatch(/^non-collegati\/[0-9a-f]{32}\.pdf$/);
    expect(report!.unreferencedMoved).toBe(1);
    expect(minio.objects.has(orphan)).toBe(false);
    expect(decryptFile(minio.objects.get(dest)!).toString()).toBe('orfano');
  });

  it('cancella la copia rimasta da un\'interruzione tra aggiornamento del DB e cancellazione', async () => {
    const { minio, store, migration } = setup();
    const target = `ricevute/2025/${RECEIPT_UUID}.pdf`;
    // il DB punta già al nuovo percorso, il vecchio file in chiaro è rimasto
    minio.objects.set(target, encryptFile(Buffer.from('contenuto')));
    minio.objects.set('ricevute/2025/7-Mario_Rossi.pdf', Buffer.from('contenuto'));
    store.receipts.push({ uuid: RECEIPT_UUID, path: target, year: 2025 });

    const report = await migration.run();

    expect(report!.unreferencedDuplicatesRemoved).toBe(1);
    expect(Array.from(minio.objects.keys())).toEqual([target]);
  });

  it('dopo un ripristino non cancella le copie: le sposta e una migrazione successiva le ricollega', async () => {
    const { minio, store, migration } = setup();
    const old = 'members/x/profile/1765392176697-MARIO_ROSSI.jpeg';
    minio.objects.set(old, Buffer.from('foto'));

    // file ripristinati prima del DB: l'oggetto non è referenziato e finisce in non-collegati/
    await migration.run({ force: true, afterRestore: true });
    expect(minio.objects.has(old)).toBe(false);
    expect(minio.objects.has(unlinkedObjectName(old))).toBe(true);

    // poi arriva il DB che lo referenzia con il vecchio nome
    store.files.push({ uuid: FILE_UUID, path: old, name: null });
    const report = await migration.run({ force: true, afterRestore: true });

    const target = `members/x/profile/${FILE_UUID}.jpeg`;
    expect(report!.moved).toBe(1);
    expect(store.files[0].path).toBe(target);
    expect(decryptFile(minio.objects.get(target)!).toString()).toBe('foto');
    expect(minio.objects.has(unlinkedObjectName(old))).toBe(false);
  });

  it('file referenziato mancante: il percorso nel DB diventa opaco', async () => {
    const { store, migration } = setup();
    store.files.push({ uuid: FILE_UUID, path: 'members/x/profile/1765392176697-DAVIDE_ORSINI.jpeg', name: null });

    const report = await migration.run();

    expect(report!.missing).toEqual([`files/${FILE_UUID}`]);
    expect(report!.missingRenamed).toBe(1);
    expect(store.files[0].path).toBe(`members/x/profile/${FILE_UUID}.jpeg`);
  });

  it('troppi file mancanti: si ferma senza toccare DB e oggetti non referenziati', async () => {
    const { minio, store, migration } = setup();
    for (let i = 0; i < 12; i++) {
      store.files.push({ uuid: `33333333-3333-4333-8333-3333333333${String(i).padStart(2, '0')}`, path: `a/${i}-Nome.pdf`, name: null });
    }
    minio.objects.set('altro/Nome_Cognome.pdf', Buffer.from('x'));

    await expect(migration.run()).rejects.toThrow(/non trovati/);
    expect(store.files[0].path).toBe('a/0-Nome.pdf');
    expect(minio.objects.has('altro/Nome_Cognome.pdf')).toBe(true);
    expect(store.done).toBe(false);
  });

  it('un errore di MinIO diverso da NotFound blocca la migrazione (non conta come mancante)', async () => {
    const { minio, store, migration } = setup();
    store.files.push({ uuid: FILE_UUID, path: 'a/1-Nome.pdf', name: null });
    minio.failStat = true;

    await expect(migration.run()).rejects.toThrow(/errori/);
    expect(store.files[0].path).toBe('a/1-Nome.pdf');
    expect(store.done).toBe(false);
  });

  it('non tocca gli oggetti referenziati solo da ricevute annullate o duplicati archiviati', async () => {
    const { minio, store, migration } = setup();
    const annulled = `ricevute/2025/${RECEIPT_UUID}-3.pdf`;
    const raw = encryptFile(Buffer.from('annullata'));
    minio.objects.set(annulled, raw);
    store.extraReferenced.push(annulled);

    await migration.run();
    expect(minio.objects.get(annulled)).toBe(raw);
  });

  it('riconosce i nomi già opachi', () => {
    expect(hasOpaqueName(`ricevute/2025/${RECEIPT_UUID}-12.pdf`)).toBe(true);
    expect(hasOpaqueName(`members/${FILE_UUID}/documents/carta-identita/${RECEIPT_UUID}.jpg`)).toBe(true);
    expect(hasOpaqueName('non-collegati/abc.pdf')).toBe(true);
    expect(hasOpaqueName('ricevute/2025/1525-Nome_Cognome_CF_20251203.pdf')).toBe(false);
    expect(hasOpaqueName(`Mario_Rossi/${RECEIPT_UUID}.pdf`)).toBe(false);
  });
});
