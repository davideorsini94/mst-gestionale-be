import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { EncryptedColumn } from '../../../common/crypto/encrypted-column';

/**
 * Ricevute annullate: un numero di ricevuta già emesso non viene mai riassegnato né cambiato.
 * Quando un'entrata viene cancellata, diventa un'uscita o cambia anno, la sua ricevuta resta qui (con il PDF) e il
 * numero risulta "annullato" invece di sparire dalla sequenza.
 */
@Entity('annulled_receipts')
export class AnnulledReceipt {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'uuid', nullable: true })
  transactionUuid: string | null;

  @Column({ type: 'int' })
  receiptYear: number;

  @Column({ type: 'int' })
  receiptNumber: number;

  @Column({ type: 'date', nullable: true })
  date: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  amount: number | null;

  @EncryptedColumn({ nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', nullable: true })
  minioPath: string | null;

  @Column({ type: 'varchar' })
  reason: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  annulledAt: Date;
}
