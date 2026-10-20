import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  blindIndex,
  computeKeyCheck,
  decryptString,
  encryptString,
  isEncryptedValue,
  keyCheckMatches,
} from '../common/crypto/field-crypto';

export const KEY_CHECK_SETTING = '__cryptoKeyCheck';
/** Momento dell'installazione della v1.4: i movimenti creati dopo non sono toccati dal vecchio bug dell'import. */
export const V14_INSTALLED_SETTING = '__v14InstalledAt';

interface TableSpec {
  table: string;
  columns: string[];
  hashes?: { column: string; hashColumn: string; kind: 'exact' | 'ci' }[];
}

/**
 * Elenco congelato dei campi cifrati alla v1.4 (non letto dalle entità: la migrazione deve restare stabile anche
 * se in futuro le entità cambiano).
 */
const TABLES: TableSpec[] = [
  {
    table: 'users',
    columns: ['firstName', 'lastName', 'email', 'phone'],
    hashes: [{ column: 'email', hashColumn: 'emailHash', kind: 'ci' }],
  },
  {
    table: 'members',
    columns: [
      'firstName', 'lastName', 'fiscalCode', 'birthDate', 'birthPlace', 'birthProvince', 'nationality', 'email',
      'phone', 'address', 'city', 'province', 'postalCode', 'fisiCode', 'fisCode', 'emergencyContact',
      'emergencyPhone', 'notes',
    ],
    hashes: [
      { column: 'email', hashColumn: 'emailHash', kind: 'ci' },
      { column: 'fiscalCode', hashColumn: 'fiscalCodeHash', kind: 'ci' },
    ],
  },
  {
    table: 'staff',
    columns: [
      'firstName', 'lastName', 'fiscalCode', 'email', 'phone', 'address', 'city', 'postalCode', 'birthDate',
      'birthPlace', 'emergencyContact', 'emergencyPhone', 'notes', 'drivingLicense', 'skiInstructorLicense',
      'firstAidCertificate',
    ],
    hashes: [
      { column: 'email', hashColumn: 'emailHash', kind: 'ci' },
      { column: 'fiscalCode', hashColumn: 'fiscalCodeHash', kind: 'ci' },
    ],
  },
  { table: 'member_documents', columns: ['description'] },
  { table: 'staff_documents', columns: ['description'] },
  {
    table: 'transactions',
    columns: ['subject', 'description', 'reference', 'invoiceNumber', 'counterpart', 'notes', 'notes2'],
    hashes: [{ column: 'subject', hashColumn: 'subjectHash', kind: 'exact' }],
  },
  {
    table: 'reminders',
    columns: ['recipientEmail', 'ccEmail', 'recipientName', 'subjectDescription', 'errorMessage'],
  },
  { table: 'files', columns: ['originalName', 'description'] },
];

const BATCH_SIZE = 500;

/**
 * Cifra i dati sensibili esistenti (AES-256-GCM, AAD = tabella.colonna) e calcola i blind index.
 * Idempotente: i valori già cifrati (prefisso enc:v1:) vengono lasciati come sono; gli hash vengono ricalcolati
 * dal valore in chiaro. Gira in una transazione: o tutto o niente.
 */
export class EncryptSensitiveData1760900001000 implements MigrationInterface {
  name = 'EncryptSensitiveData1760900001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.verifyOrStoreKeyCheck(queryRunner);

    for (const spec of TABLES) {
      await this.encryptTable(queryRunner, spec);
    }

    await this.encryptSmtpPassword(queryRunner);

    await queryRunner.query(
      `INSERT INTO settings (key, value, description) VALUES ($1, to_jsonb(now()::timestamp::text), $2) ON CONFLICT (key) DO NOTHING`,
      [V14_INSTALLED_SETTING, 'Installazione v1.4 (non modificare)'],
    );
  }

  public async down(): Promise<void> {
    throw new Error('La cifratura non si annulla con una migrazione: ripristinare il backup pre-aggiornamento');
  }

  private async verifyOrStoreKeyCheck(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`SELECT value FROM settings WHERE key = $1`, [KEY_CHECK_SETTING]);
    if (rows.length) {
      if (!keyCheckMatches(rows[0].value)) {
        throw new Error('Le chiavi di cifratura non corrispondono a quelle usate per cifrare questo database');
      }
      return;
    }
    await queryRunner.query(`INSERT INTO settings (key, value, description) VALUES ($1, $2::jsonb, $3)`, [
      KEY_CHECK_SETTING,
      JSON.stringify(computeKeyCheck()),
      'Controllo chiavi di cifratura (non modificare)',
    ]);
  }

  private async encryptTable(queryRunner: QueryRunner, spec: TableSpec): Promise<void> {
    const hashes = spec.hashes ?? [];
    const selectCols = spec.columns.map((c) => `"${c}"`).join(', ');
    let lastUuid: string | null = null;
    let processed = 0;
    let changed = 0;

    for (;;) {
      const rows: any[] = await queryRunner.query(
        `SELECT uuid::text AS uuid, ${selectCols} FROM "${spec.table}"
         ${lastUuid ? 'WHERE uuid > $1::uuid' : ''} ORDER BY uuid LIMIT ${BATCH_SIZE}`,
        lastUuid ? [lastUuid] : [],
      );
      if (!rows.length) break;
      lastUuid = rows[rows.length - 1].uuid;
      processed += rows.length;

      const updates: { uuid: string; values: Record<string, string | null> }[] = [];
      for (const row of rows) {
        const values: Record<string, string | null> = {};
        let rowChanged = false;
        for (const col of spec.columns) {
          const value = row[col];
          if (value === null || value === undefined || value === '') {
            values[col] = value ?? null;
            continue;
          }
          const aad = `${spec.table}.${col}`;
          if (isEncryptedValue(value)) {
            // Verifica che si decifri con la chiave attuale (fallisce in modo esplicito se no)
            decryptString(value, aad);
            values[col] = value;
          } else {
            values[col] = encryptString(String(value), aad);
            rowChanged = true;
          }
        }
        for (const h of hashes) {
          const plain = row[h.column] === null || row[h.column] === undefined
            ? null
            : decryptString(String(row[h.column]), `${spec.table}.${h.column}`);
          values[h.hashColumn] = blindIndex(plain, h.kind);
          rowChanged = true;
        }
        if (rowChanged) updates.push({ uuid: row.uuid, values });
      }

      if (updates.length) {
        const allCols = [...spec.columns, ...hashes.map((h) => h.hashColumn)];
        const params: any[] = [updates.map((u) => u.uuid)];
        const setParts: string[] = [];
        const aliasCols: string[] = ['uuid'];
        allCols.forEach((col, i) => {
          params.push(updates.map((u) => u.values[col] ?? null));
          setParts.push(`"${col}" = v."c${i}"`);
          aliasCols.push(`"c${i}"`);
        });
        const unnestArgs = allCols.map((_, i) => `$${i + 2}::text[]`).join(', ');
        await queryRunner.query(
          `UPDATE "${spec.table}" AS t SET ${setParts.join(', ')}
           FROM unnest($1::uuid[], ${unnestArgs}) AS v(${aliasCols.join(', ')})
           WHERE t.uuid = v.uuid`,
          params,
        );
        changed += updates.length;
      }
    }

    console.log(`[Migration] ${spec.table}: ${processed} righe controllate, ${changed} aggiornate`);
  }

  private async encryptSmtpPassword(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`SELECT value FROM settings WHERE key = 'smtpConfig'`);
    const config = rows[0]?.value;
    if (!config || typeof config !== 'object' || !config.pass || isEncryptedValue(config.pass)) return;
    const updated = { ...config, pass: encryptString(String(config.pass), 'settings.smtpConfig.pass') };
    await queryRunner.query(`UPDATE settings SET value = $1::jsonb WHERE key = 'smtpConfig'`, [JSON.stringify(updated)]);
    console.log('[Migration] settings: password SMTP cifrata');
  }
}
