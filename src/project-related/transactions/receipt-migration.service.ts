import { Injectable } from '@nestjs/common';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { MinioService } from '../../minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { Repository } from 'typeorm';

@Injectable()
export class ReceiptMigrationService {
  private readonly transactionRepo: Repository<Transaction>;

  constructor(private readonly minioService: MinioService) {
    this.transactionRepo = dataSource.getRepository(Transaction);
  }

  async migrateReceiptsToYearFolders(): Promise<{ migrated: number; errors: string[] }> {
    const errors: string[] = [];
    let migrated = 0;

    const transactions = await this.transactionRepo.find({
      where: {
        type: TransactionType.INCOME,
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
        console.log(`[Migration] Transaction ${transaction.uuid} already in correct folder`);
        continue;
      }

      try {
        const fileExists = await this.minioService.fileExists(currentPath);
        if (!fileExists) {
          console.log(`[Migration] File not found for transaction ${transaction.uuid}`);
          continue;
        }

        const filename = currentPath.split('/').pop();
        const newPath = `ricevute/${transaction.receiptYear}/${filename}`;

        console.log(`[Migration] Moving receipt of transaction ${transaction.uuid}`);

        const movedPath = await this.minioService.moveFile(currentPath, newPath);

        transaction.receiptMinioPath = movedPath;
        await this.transactionRepo.save(transaction);

        migrated++;
        console.log(`[Migration] Successfully migrated transaction ${transaction.uuid}`);
      } catch (error) {
        const errorMsg = `Error migrating transaction ${transaction.uuid}: ${error.message}`;
        console.error(`[Migration] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[Migration] Completed. Migrated: ${migrated}, Errors: ${errors.length}`);
    return { migrated, errors };
  }

  async regenerateAllReceipts(): Promise<{ regenerated: number; errors: string[] }> {
    const errors: string[] = [];
    let regenerated = 0;

    const transactions = await this.transactionRepo.find({
      where: {
        type: TransactionType.INCOME,
      },
    });

    console.log(`[Regenerate] Found ${transactions.length} income transactions`);

    return { regenerated, errors };
  }
}
