import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recupero password dimenticata (token monouso, solo hash) e data dell'ultimo cambio password: i login emessi prima
 * di un cambio/reset smettono di valere.
 */
export class PasswordReset1760900004000 implements MigrationInterface {
  name = 'PasswordReset1760900004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userUuid" uuid NOT NULL,
        "tokenHash" character varying NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "usedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("uuid")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordChangedAt"`);
  }
}
