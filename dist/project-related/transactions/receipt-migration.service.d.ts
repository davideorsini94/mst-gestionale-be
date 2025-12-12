import { MinioService } from '../../minio/minio.service';
export declare class ReceiptMigrationService {
    private readonly minioService;
    private readonly transactionRepo;
    constructor(minioService: MinioService);
    migrateReceiptsToYearFolders(): Promise<{
        migrated: number;
        errors: string[];
    }>;
    regenerateAllReceipts(): Promise<{
        regenerated: number;
        errors: string[];
    }>;
}
