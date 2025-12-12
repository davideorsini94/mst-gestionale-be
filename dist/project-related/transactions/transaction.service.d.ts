import { BaseService } from '../../common/base-crud/base.service';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FindOptionsOrder } from 'typeorm';
import { CategoryService } from '../categories/category.service';
import { ReceiptService } from './receipt.service';
export declare class TransactionService extends BaseService<Transaction, CreateTransactionDto, UpdateTransactionDto> {
    private readonly categoryService;
    private readonly receiptService;
    constructor(categoryService: CategoryService, receiptService: ReceiptService);
    protected getDefaultOrder(): FindOptionsOrder<Transaction>;
    protected getDefaultRelations(): {
        category: boolean;
    };
    createTransaction(dto: CreateTransactionDto): Promise<Transaction>;
    updateTransaction(uuid: string, dto: UpdateTransactionDto): Promise<Transaction>;
    deleteTransaction(uuid: string): Promise<void>;
    getReceiptStream(uuid: string): Promise<any>;
    getStatistics(startDate?: string, endDate?: string, categoryUuid?: string): Promise<{
        totalIncome: number;
        totalExpense: number;
        balance: number;
        byCategory: {
            categoryName: string;
            total: number;
            type: string;
        }[];
        byMonth: {
            month: string;
            income: number;
            expense: number;
        }[];
    }>;
}
