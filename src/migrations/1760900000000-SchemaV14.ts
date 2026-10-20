import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema v1.4.
 * - birthDate (members/staff) da date a varchar senza perdita: to_char(...,'YYYY-MM-DD') non dipende da DateStyle.
 *   Il valore verrà poi cifrato da M2.
 * - Colonne blind index per le ricerche esatte su campi cifrati.
 * - Preferenze utente (tema, trasparenza).
 * - Colonne per la revisione degli importi rovinati dal vecchio import e archivio dei duplicati rimossi.
 * Tutte le istruzioni sono idempotenti (IF NOT EXISTS / controllo del tipo attuale).
 */
export class SchemaV141760900000000 implements MigrationInterface {
  name = 'SchemaV141760900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['members', 'staff']) {
      const [col] = await queryRunner.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'birthDate'`,
        [table],
      );
      if (col?.data_type === 'date') {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "birthDate" TYPE character varying USING to_char("birthDate", 'YYYY-MM-DD')`,
        );
      }
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "emailHash" character varying`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "fiscalCodeHash" character varying`);
    }

    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailHash" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb`);

    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "subjectHash" character varying`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amountReview" character varying`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amountBeforeReview" numeric(10,2)`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "originalAmountBeforeReview" numeric(10,2)`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amountReviewedAt" TIMESTAMP`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions_removed_duplicates" (
        "uuid" uuid NOT NULL,
        "keptUuid" uuid,
        "removedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "importBatch" character varying,
        "data" jsonb NOT NULL,
        CONSTRAINT "PK_transactions_removed_duplicates" PRIMARY KEY ("uuid")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Annullabile solo prima di M2 (dati ancora in chiaro); il rollback reale è il ripristino del backup.
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions_removed_duplicates"`);
    for (const col of ['amountReviewedAt', 'originalAmountBeforeReview', 'amountBeforeReview', 'amountReview', 'subjectHash']) {
      await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "${col}"`);
    }
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "preferences"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailHash"`);
    for (const table of ['members', 'staff']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "fiscalCodeHash"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "emailHash"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "birthDate" TYPE date USING NULLIF("birthDate", '')::date`,
      );
    }
  }
}
