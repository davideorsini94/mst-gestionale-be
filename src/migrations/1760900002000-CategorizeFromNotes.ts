import { MigrationInterface, QueryRunner } from 'typeorm';
import { decryptString, isEncryptedValue } from '../common/crypto/field-crypto';
import { categoryFromNote } from '../project-related/categories/note-categories';

const BATCH_SIZE = 1000;

/**
 * Assegna una categoria ai movimenti che ne sono senza, deducendola dalle note (vedi note-categories.ts).
 * Tocca solo i movimenti con categoria vuota e note presenti: note, importi e categorie già scelte restano come sono.
 * Le categorie mancanti vengono create (tipo BOTH, come quelle create dall'import); se esiste già una categoria con lo
 * stesso nome (senza distinzione di maiuscole) viene riutilizzata.
 */
export class CategorizeFromNotes1760900002000 implements MigrationInterface {
  name = 'CategorizeFromNotes1760900002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: { uuid: string; name: string }[] = await queryRunner.query(
      `SELECT uuid::text AS uuid, name FROM categories ORDER BY "createdAt"`,
    );
    const categoryUuids = new Map<string, string>();
    for (const c of existing) {
      const key = c.name.trim().toLowerCase();
      if (!categoryUuids.has(key)) categoryUuids.set(key, c.uuid);
    }

    const byCategory = new Map<string, string[]>();
    let lastUuid: string | null = null;
    for (;;) {
      const rows: { uuid: string; notes: string }[] = await queryRunner.query(
        `SELECT uuid::text AS uuid, notes FROM transactions
         WHERE "categoryUuid" IS NULL AND notes IS NOT NULL AND notes <> '' ${lastUuid ? 'AND uuid > $1::uuid' : ''}
         ORDER BY uuid LIMIT ${BATCH_SIZE}`,
        lastUuid ? [lastUuid] : [],
      );
      if (!rows.length) break;
      lastUuid = rows[rows.length - 1].uuid;

      for (const row of rows) {
        const note = isEncryptedValue(row.notes) ? decryptString(row.notes, 'transactions.notes') : row.notes;
        const category = categoryFromNote(note);
        if (!category) continue;
        const list = byCategory.get(category) ?? [];
        list.push(row.uuid);
        byCategory.set(category, list);
      }
    }

    let assigned = 0;
    let created = 0;
    for (const [name, uuids] of byCategory) {
      let categoryUuid = categoryUuids.get(name.toLowerCase());
      if (!categoryUuid) {
        const [row] = await queryRunner.query(
          `INSERT INTO categories (name, type, "isActive") VALUES ($1, 'BOTH', true) RETURNING uuid::text AS uuid`,
          [name],
        );
        categoryUuid = row.uuid as string;
        categoryUuids.set(name.toLowerCase(), categoryUuid);
        created++;
      }
      for (let i = 0; i < uuids.length; i += BATCH_SIZE) {
        const chunk = uuids.slice(i, i + BATCH_SIZE);
        const [, count] = await queryRunner.query(
          `UPDATE transactions SET "categoryUuid" = $1::uuid WHERE uuid = ANY($2::uuid[]) AND "categoryUuid" IS NULL`,
          [categoryUuid, chunk],
        );
        assigned += Number(count) || 0;
      }
    }

    console.log(`[Migrazione] Categorie dalle note: ${assigned} movimenti categorizzati, ${created} categorie create`);
  }

  public async down(): Promise<void> {
    // nessuna traccia di quali movimenti erano senza categoria: per tornare indietro si ripristina il backup
    throw new Error('Le categorie assegnate dalle note non si annullano con una migrazione: ripristinare il backup');
  }
}
