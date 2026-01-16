import { Injectable } from '@nestjs/common';
import { BaseService, CustomRequestContext } from '../../common/base-crud/base.service';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FindOptionsOrder, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { CategoryService } from '../categories/category.service';
import { CategoryType } from '../categories/entities/category.entity';
import { ReceiptService } from './receipt.service';

@Injectable()
export class TransactionService extends BaseService<Transaction, CreateTransactionDto, UpdateTransactionDto> {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly receiptService: ReceiptService,
  ) {
    super(Transaction);
  }

  protected getDefaultOrder(): FindOptionsOrder<Transaction> {
    return { date: 'DESC', createdAt: 'DESC' };
  }

  protected getDefaultRelations() {
    return { category: true };
  }

  /**
   * Override create per gestire la creazione automatica della categoria
   */
  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    // Se c'è categoryName ma non categoryUuid, trova o crea la categoria
    if (dto.categoryName && !dto.categoryUuid) {
      // Crea sempre categorie come BOTH così appaiono sia per entrate che uscite
      const category = await this.categoryService.findOrCreateByName(dto.categoryName, CategoryType.BOTH);
      dto.categoryUuid = category.uuid;
    }

    // Rimuovi categoryName dal dto prima di salvare
    const { categoryName, ...transactionData } = dto;
    let transaction = await this.create(transactionData as CreateTransactionDto);

    // Se è un'entrata, genera la ricevuta PDF
    if (transaction.type === TransactionType.INCOME) {
      try {
        const receiptData = await this.receiptService.createAndUploadReceipt(transaction);
        transaction.receiptMinioPath = receiptData.minioPath;
        transaction.receiptNumber = receiptData.receiptNumber;
        transaction.receiptYear = receiptData.receiptYear;
        transaction = await this.repo.save(transaction);
        console.log(`[TransactionService] Receipt created for transaction ${transaction.uuid}: ${receiptData.minioPath}`);
      } catch (error) {
        console.error(`[TransactionService] Error creating receipt for transaction ${transaction.uuid}:`, error);
      }
    }

    return transaction;
  }

  /**
   * Override update per gestire la creazione automatica della categoria
   */
  async updateTransaction(uuid: string, dto: UpdateTransactionDto): Promise<Transaction> {
    // Se c'è categoryName ma non categoryUuid, trova o crea la categoria
    if ((dto as any).categoryName && !dto.categoryUuid) {
      // Crea sempre categorie come BOTH così appaiono sia per entrate che uscite
      const category = await this.categoryService.findOrCreateByName((dto as any).categoryName, CategoryType.BOTH);
      dto.categoryUuid = category.uuid;
    }

    // Rimuovi categoryName dal dto prima di salvare
    const { categoryName, ...transactionData } = dto as any;
    let transaction = await this.update(uuid, transactionData as UpdateTransactionDto);

    // Se è un'entrata, rigenera la ricevuta PDF
    if (transaction.type === TransactionType.INCOME) {
      try {
        const receiptData = await this.receiptService.updateReceipt(transaction);
        transaction.receiptMinioPath = receiptData.minioPath;
        transaction.receiptNumber = receiptData.receiptNumber;
        transaction.receiptYear = receiptData.receiptYear;
        transaction = await this.repo.save(transaction);
        console.log(`[TransactionService] Receipt updated for transaction ${transaction.uuid}: ${receiptData.minioPath}`);
      } catch (error) {
        console.error(`[TransactionService] Error updating receipt for transaction ${transaction.uuid}:`, error);
      }
    } else if (transaction.receiptMinioPath) {
      // Se il tipo è cambiato da INCOME a EXPENSE, elimina la ricevuta
      await this.receiptService.deleteReceipt(transaction.receiptMinioPath);
      transaction.receiptMinioPath = null;
      transaction.receiptNumber = null;
      transaction.receiptYear = null;
      transaction = await this.repo.save(transaction);
    }

    return transaction;
  }

  async deleteTransaction(uuid: string): Promise<void> {
    const transaction = await this.findByUuid(uuid);
    if (!transaction) {
      return;
    }

    const wasIncome = transaction.type === TransactionType.INCOME;
    const receiptYear = transaction.receiptYear;

    // Elimina la ricevuta se esiste
    if (transaction.receiptMinioPath) {
      await this.receiptService.deleteReceipt(transaction.receiptMinioPath);
    }

    // Elimina la transazione
    await this.delete(uuid);

    // Se era un'entrata, rigenera tutte le ricevute dell'anno per mantenere la numerazione coerente
    if (wasIncome && receiptYear) {
      console.log(`[TransactionService] Rigenerazione ricevute per anno ${receiptYear} dopo eliminazione`);
      await this.receiptService.regenerateReceiptsForYear(receiptYear);
    }
  }

  async getReceiptStream(uuid: string): Promise<any> {
    const transaction = await this.findByUuid(uuid);
    if (!transaction || !transaction.receiptMinioPath) {
      throw new Error('Receipt not found');
    }
    return this.receiptService.getReceiptStream(transaction.receiptMinioPath);
  }

  async getStatistics(
    startDate?: string,
    endDate?: string,
    categoryUuid?: string,
  ): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
    byCategory: { categoryName: string; total: number; type: string }[];
    byMonth: { month: string; income: number; expense: number }[];
  }> {
    const queryBuilder = this.getQueryBuilder('t');

    if (startDate && endDate) {
      queryBuilder.andWhere('t.date BETWEEN :startDate AND :endDate', { startDate, endDate });
    } else if (startDate) {
      queryBuilder.andWhere('t.date >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('t.date <= :endDate', { endDate });
    }

    if (categoryUuid) {
      queryBuilder.andWhere('t.categoryUuid = :categoryUuid', { categoryUuid });
    }

    queryBuilder.leftJoinAndSelect('t.category', 'category');

    const transactions = await queryBuilder.getMany();

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryMap = new Map<string, { categoryName: string; total: number; type: string }>();
    const monthMap = new Map<string, { income: number; expense: number }>();

    for (const t of transactions) {
      const amount = Number(t.amount);

      if (t.type === TransactionType.INCOME) {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }

      // By category
      const catKey = t.category?.uuid || 'uncategorized';
      const catName = t.category?.name || 'Senza categoria';
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, { categoryName: catName, total: 0, type: t.type });
      }
      const catEntry = categoryMap.get(catKey);
      catEntry.total += amount;

      // By month
      const monthKey = new Date(t.date).toISOString().slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expense: 0 });
      }
      const monthEntry = monthMap.get(monthKey);
      if (t.type === TransactionType.INCOME) {
        monthEntry.income += amount;
      } else {
        monthEntry.expense += amount;
      }
    }

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      byCategory: Array.from(categoryMap.values()),
      byMonth: Array.from(monthMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => b.month.localeCompare(a.month)),
    };
  }
}
