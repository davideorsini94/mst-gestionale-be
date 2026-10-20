import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EncryptedColumn } from '../../../common/crypto/encrypted-column';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Category } from '../../categories/entities/category.entity';

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum AmountReviewStatus {
  /** L'importo era stato rovinato dall'import e l'utente l'ha corretto */
  CORRECTED = 'CORRECTED',
  /** L'utente ha confermato che l'importo è giusto */
  CONFIRMED = 'CONFIRMED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  CHECK = 'CHECK',
  OTHER = 'OTHER',
}

@Entity('transactions')
export class Transaction extends IctBaseEntity {
  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalAmount: number;

  @Column({ type: 'date' })
  date: Date;

  @EncryptedColumn({ nullable: true, hash: { property: 'subjectHash', kind: 'exact' } })
  subject: string;

  @Column({ nullable: true, select: false })
  subjectHash: string;

  @EncryptedColumn({ nullable: true })
  description: string;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'categoryUuid' })
  category: Category;

  @Column({ nullable: true })
  categoryUuid: string;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @EncryptedColumn({ nullable: true })
  reference: string;

  @EncryptedColumn({ nullable: true })
  invoiceNumber: string;

  @EncryptedColumn({ nullable: true })
  counterpart: string;

  @EncryptedColumn({ nullable: true, type: 'text' })
  notes: string;

  @EncryptedColumn({ nullable: true, type: 'text' })
  notes2: string;

  @Column({ nullable: true })
  budgetItem: string;

  @Column({ nullable: true })
  attachmentUrl: string;

  @Column({ default: false })
  isRecurring: boolean;

  @Column({ nullable: true })
  recurringPeriod: string;

  @Column({ nullable: true })
  receiptMinioPath: string;

  @Column({ nullable: true })
  receiptNumber: number;

  @Column({ nullable: true })
  receiptYear: number;

  // Revisione degli importi rovinati dal vecchio import Excel (v1.3): valori originali conservati per l'annullamento
  @Column({ type: 'varchar', nullable: true })
  amountReview: AmountReviewStatus | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amountBeforeReview: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalAmountBeforeReview: number | null;

  @Column({ type: 'timestamp', nullable: true })
  amountReviewedAt: Date | null;
}
