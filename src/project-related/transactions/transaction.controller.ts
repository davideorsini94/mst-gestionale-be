import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { ReceiptMigrationService } from './receipt-migration.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly receiptMigrationService: ReceiptMigrationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista transazioni' })
  @RequireCapabilities(Capability.CAN_VIEW_TRANSACTIONS)
  async findAll(@Query('filters') filters?: string) {
    return this.transactionService.findAndCountWithFilterList(filters, null);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Statistiche finanziarie' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'categoryUuid', required: false })
  @RequireCapabilities(Capability.CAN_VIEW_STATISTICS)
  async getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryUuid') categoryUuid?: string,
  ) {
    return this.transactionService.getStatistics(startDate, endDate, categoryUuid);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio transazione' })
  @RequireCapabilities(Capability.CAN_VIEW_TRANSACTIONS)
  async findOne(@Param('uuid') uuid: string) {
    return this.transactionService.findByUuid(uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Crea transazione' })
  @RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
  async create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.createTransaction(createTransactionDto);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna transazione' })
  @RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
  async update(@Param('uuid') uuid: string, @Body() updateTransactionDto: UpdateTransactionDto) {
    return this.transactionService.updateTransaction(uuid, updateTransactionDto);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina transazione' })
  @RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
  async remove(@Param('uuid') uuid: string) {
    return this.transactionService.deleteTransaction(uuid);
  }

  @Get(':uuid/receipt')
  @ApiOperation({ summary: 'Scarica ricevuta PDF' })
  @RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
  async getReceipt(@Param('uuid') uuid: string, @Res() reply: FastifyReply) {
    try {
      const transaction = await this.transactionService.findByUuid(uuid);
      if (!transaction || !transaction.receiptMinioPath) {
        throw new NotFoundException('Ricevuta non trovata');
      }

      const stream = await this.transactionService.getReceiptStream(uuid);
      
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="ricevuta_${transaction.receiptNumber}_${transaction.receiptYear}.pdf"`);
      
      return reply.send(stream);
    } catch (error) {
      throw new NotFoundException('Ricevuta non trovata');
    }
  }

  @Post('migrate-receipts')
  @ApiOperation({ summary: 'Migra ricevute esistenti nella struttura cartelle per anno' })
  @RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
  async migrateReceipts() {
    return this.receiptMigrationService.migrateReceiptsToYearFolders();
  }
}
