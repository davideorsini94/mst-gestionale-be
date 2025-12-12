"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptMigrationService = void 0;
const common_1 = require("@nestjs/common");
const transaction_entity_1 = require("./entities/transaction.entity");
const minio_service_1 = require("../../minio/minio.service");
const data_source_1 = require("../../datasources/data-source");
let ReceiptMigrationService = class ReceiptMigrationService {
    constructor(minioService) {
        this.minioService = minioService;
        this.transactionRepo = data_source_1.dataSource.getRepository(transaction_entity_1.Transaction);
    }
    async migrateReceiptsToYearFolders() {
        const errors = [];
        let migrated = 0;
        const transactions = await this.transactionRepo.find({
            where: {
                type: transaction_entity_1.TransactionType.INCOME,
            },
        });
        console.log(`[Migration] Found ${transactions.length} income transactions to check`);
        for (const transaction of transactions) {
            if (!transaction.receiptMinioPath) {
                continue;
            }
            const currentPath = transaction.receiptMinioPath;
            const expectedPathPrefix = `ricevute/${transaction.receiptYear}/`;
            if (currentPath.startsWith(expectedPathPrefix)) {
                console.log(`[Migration] Transaction ${transaction.uuid} already in correct folder: ${currentPath}`);
                continue;
            }
            try {
                const fileExists = await this.minioService.fileExists(currentPath);
                if (!fileExists) {
                    console.log(`[Migration] File not found for transaction ${transaction.uuid}: ${currentPath}`);
                    continue;
                }
                const filename = currentPath.split('/').pop();
                const newPath = `ricevute/${transaction.receiptYear}/${filename}`;
                console.log(`[Migration] Moving ${currentPath} -> ${newPath}`);
                const movedPath = await this.minioService.moveFile(currentPath, newPath);
                transaction.receiptMinioPath = movedPath;
                await this.transactionRepo.save(transaction);
                migrated++;
                console.log(`[Migration] Successfully migrated transaction ${transaction.uuid}`);
            }
            catch (error) {
                const errorMsg = `Error migrating transaction ${transaction.uuid}: ${error.message}`;
                console.error(`[Migration] ${errorMsg}`);
                errors.push(errorMsg);
            }
        }
        console.log(`[Migration] Completed. Migrated: ${migrated}, Errors: ${errors.length}`);
        return { migrated, errors };
    }
    async regenerateAllReceipts() {
        const errors = [];
        let regenerated = 0;
        const transactions = await this.transactionRepo.find({
            where: {
                type: transaction_entity_1.TransactionType.INCOME,
            },
        });
        console.log(`[Regenerate] Found ${transactions.length} income transactions`);
        return { regenerated, errors };
    }
};
exports.ReceiptMigrationService = ReceiptMigrationService;
exports.ReceiptMigrationService = ReceiptMigrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [minio_service_1.MinioService])
], ReceiptMigrationService);
//# sourceMappingURL=receipt-migration.service.js.map