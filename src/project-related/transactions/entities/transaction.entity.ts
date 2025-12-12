import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Category } from '../../categories/entities/category.entity';

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
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

  @Column({ nullable: true })
  subject: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'categoryUuid' })
  category: Category;

  @Column({ nullable: true })
  categoryUuid: string;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  reference: string;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ nullable: true })
  counterpart: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
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
}
