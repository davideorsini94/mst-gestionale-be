import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Richieste di recupero password. Del token si salva solo l'hash SHA-256: chi legge il DB (o un backup) non può usarlo.
 * Ogni token vale 30 minuti e una sola volta.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'uuid' })
  userUuid: string;

  @Column({ type: 'varchar' })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
