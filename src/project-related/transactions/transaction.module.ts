import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { CategoryModule } from '../categories/category.module';
import { ReceiptService } from './receipt.service';
import { ReceiptMigrationService } from './receipt-migration.service';
import { ExcelImportService } from './excel-import.service';
import { TransactionMaintenanceService } from './transaction-maintenance.service';
import { TransactionMaintenanceController } from './transaction-maintenance.controller';
import { MinioModule } from '../../minio/minio.module';

@Module({
  imports: [CategoryModule, MinioModule],
  controllers: [TransactionMaintenanceController, TransactionController],
  providers: [TransactionService, ReceiptService, ReceiptMigrationService, ExcelImportService, TransactionMaintenanceService],
  exports: [TransactionService],
})
export class TransactionModule {}
