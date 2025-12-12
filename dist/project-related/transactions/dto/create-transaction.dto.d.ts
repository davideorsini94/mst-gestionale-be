import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { TransactionType, PaymentMethod } from '../entities/transaction.entity';
export declare class CreateTransactionDto extends BaseSaveDto {
    type: TransactionType;
    amount: number;
    originalAmount?: number;
    date: string;
    subject?: string;
    description?: string;
    categoryUuid?: string;
    categoryName?: string;
    paymentMethod?: PaymentMethod;
    reference?: string;
    invoiceNumber?: string;
    counterpart?: string;
    notes?: string;
    notes2?: string;
    budgetItem?: string;
    isRecurring?: boolean;
    recurringPeriod?: string;
}
