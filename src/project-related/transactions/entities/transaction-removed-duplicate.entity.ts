import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Archivio dei movimenti rimossi dalla "Pulizia duplicati da import".
 * `data` contiene la riga originale così come era nel DB (campi sensibili già cifrati), per poterla ripristinare.
 */
@Entity('transactions_removed_duplicates')
export class TransactionRemovedDuplicate {
  @PrimaryColumn('uuid')
  uuid: string;

  @Column({ type: 'uuid', nullable: true })
  keptUuid: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  removedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  importBatch: string | null;

  @Column({ type: 'jsonb' })
  data: Record<string, any>;
}
