import { FastifyReply } from 'fastify';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ReceiptMigrationService } from './receipt-migration.service';
export declare class TransactionController {
    private readonly transactionService;
    private readonly receiptMigrationService;
    constructor(transactionService: TransactionService, receiptMigrationService: ReceiptMigrationService);
    findAll(filters?: string): Promise<[import("./entities/transaction.entity").Transaction[], number]>;
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
    findOne(uuid: string): Promise<import("./entities/transaction.entity").Transaction>;
    create(createTransactionDto: CreateTransactionDto): Promise<import("./entities/transaction.entity").Transaction>;
    update(uuid: string, updateTransactionDto: UpdateTransactionDto): Promise<import("./entities/transaction.entity").Transaction>;
    remove(uuid: string): Promise<void>;
    getReceipt(uuid: string, reply: FastifyReply): Promise<never>;
    migrateReceipts(): Promise<{
        migrated: number;
        errors: string[];
    }>;
}
