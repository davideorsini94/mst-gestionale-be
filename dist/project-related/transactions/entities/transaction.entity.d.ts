import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Category } from '../../categories/entities/category.entity';
export declare enum TransactionType {
    INCOME = "INCOME",
    EXPENSE = "EXPENSE"
}
export declare enum PaymentMethod {
    CASH = "CASH",
    BANK_TRANSFER = "BANK_TRANSFER",
    CREDIT_CARD = "CREDIT_CARD",
    CHECK = "CHECK",
    OTHER = "OTHER"
}
export declare class Transaction extends IctBaseEntity {
    type: TransactionType;
    amount: number;
    originalAmount: number;
    date: Date;
    subject: string;
    description: string;
    category: Category;
    categoryUuid: string;
    paymentMethod: PaymentMethod;
    reference: string;
    invoiceNumber: string;
    counterpart: string;
    notes: string;
    notes2: string;
    budgetItem: string;
    attachmentUrl: string;
    isRecurring: boolean;
    recurringPeriod: string;
    receiptMinioPath: string;
    receiptNumber: number;
    receiptYear: number;
}
