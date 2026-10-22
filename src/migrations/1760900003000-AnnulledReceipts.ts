import { MigrationInterface, QueryRunner } from 'typeorm';

/** Archivio delle ricevute annullate: i numeri di ricevuta non vengono più riassegnati (vedi AnnulledReceipt). */
export class AnnulledReceipts1760900003000 implements MigrationInterface {
  name = 'AnnulledReceipts1760900003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "annulled_receipts" (
        "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionUuid" uuid,
        "receiptYear" integer NOT NULL,
        "receiptNumber" integer NOT NULL,
        "date" date,
        "amount" numeric(10,2),
        "subject" character varying,
        "minioPath" character varying,
        "reason" character varying NOT NULL,
        "annulledAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_annulled_receipts" PRIMARY KEY ("uuid")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "annulled_receipts"`);
  }
}
