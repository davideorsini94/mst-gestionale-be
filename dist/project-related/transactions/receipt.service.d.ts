import { Transaction } from './entities/transaction.entity';
import { MinioService } from '../../minio/minio.service';
export declare class ReceiptService {
    private readonly minioService;
    private readonly transactionRepo;
    constructor(minioService: MinioService);
    private getAssetsPath;
    getNextReceiptNumber(year: number): Promise<number>;
    generateReceiptPdf(transaction: Transaction): Promise<Buffer>;
    private getPaymentMethodLabel;
    createAndUploadReceipt(transaction: Transaction): Promise<{
        minioPath: string;
        receiptNumber: number;
        receiptYear: number;
    }>;
    updateReceipt(transaction: Transaction): Promise<{
        minioPath: string;
        receiptNumber: number;
        receiptYear: number;
    }>;
    deleteReceipt(minioPath: string): Promise<void>;
    getReceiptStream(minioPath: string): Promise<any>;
}
