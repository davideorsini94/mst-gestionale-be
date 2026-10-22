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
    // una modifica alla volta per movimento: due modifiche contemporanee consumavano numeri di ricevuta
    return this.receiptService.withTransactionLock(uuid, () => this.doUpdateTransaction(uuid, dto));
  }

  private async doUpdateTransaction(uuid: string, dto: UpdateTransactionDto): Promise<Transaction> {
    // la ricevuta emessa com'è ora (importo, data, soggetto): se viene annullata l'archivio deve riportare questi dati
    const before = await this.findByUuid(uuid);
    // Se c'è categoryName ma non categoryUuid, trova o crea la categoria
    if ((dto as any).categoryName && !dto.categoryUuid) {
      // Crea sempre categorie come BOTH così appaiono sia per entrate che uscite
      const category = await this.categoryService.findOrCreateByName((dto as any).categoryName, CategoryType.BOTH);
      dto.categoryUuid = category.uuid;
    }

    // Rimuovi categoryName dal dto prima di salvare
    const { categoryName, ...transactionData } = dto as any;
    await this.update(uuid, transactionData as UpdateTransactionDto);
    // Si ricarica la riga completa: il risultato di update() contiene solo i campi del DTO, senza numero/anno/percorso
    // della ricevuta (la ricevuta verrebbe rinumerata o generata con dati mancanti)
    let transaction = await this.findByUuid(uuid);

    // Se è un'entrata, rigenera la ricevuta PDF
    if (transaction.type === TransactionType.INCOME) {
      try {
        const receiptData = await this.receiptService.updateReceipt(transaction, before);
        transaction.receiptMinioPath = receiptData.minioPath;
        transaction.receiptNumber = receiptData.receiptNumber;
        transaction.receiptYear = receiptData.receiptYear;
        transaction = await this.repo.save(transaction);
        console.log(`[TransactionService] Receipt updated for transaction ${transaction.uuid}: ${receiptData.minioPath}`);
      } catch (error) {
        console.error(`[TransactionService] Error updating receipt for transaction ${transaction.uuid}:`, error);
      }
    } else if (transaction.receiptNumber || transaction.receiptMinioPath) {
      // Da entrata a uscita: la ricevuta emessa viene annullata (numero e PDF in archivio, il numero non si riusa)
      await this.receiptService.annulReceipt(
        before?.receiptNumber === transaction.receiptNumber ? before : transaction,
        'Movimento cambiato da entrata a uscita',
      );
      transaction.receiptMinioPath = null;
      transaction.receiptNumber = null;
      transaction.receiptYear = null;
      transaction = await this.repo.save(transaction);
    }

    return transaction;
  }

  async deleteTransaction(uuid: string): Promise<void> {
    await this.receiptService.withTransactionLock(uuid, async () => {
      const transaction = await this.findByUuid(uuid);
      if (!transaction) {
        return;
      }
      // La ricevuta emessa non sparisce e le altre non vengono rinumerate: il numero risulta annullato (con il PDF)
      await this.receiptService.annulReceipt(transaction, 'Movimento eliminato');
      await this.delete(uuid);
    });
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
    byCategory: { categoryUuid: string | null; categoryName: string; total: number; type: string }[];
    byMonth: { month: string; income: number; expense: number }[];
  }> {
    // Aggregazioni in SQL: nessun bisogno di caricare (e decifrare) tutti i movimenti
    const conditions: string[] = [];
    const params: any[] = [];
    if (startDate) {
      params.push(startDate);
      conditions.push(`t.date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`t.date <= $${params.length}`);
    }
    if (categoryUuid) {
      params.push(categoryUuid);
      conditions.push(`t."categoryUuid" = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [totals] = await this.dataSource.query(
      `SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'), 0) AS income,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense
       FROM transactions t ${where}`,
      params,
    );

    // Per categoria E tipo: una categoria usata sia per entrate sia per uscite produce due righe
    const byCategory = await this.dataSource.query(
      `SELECT t."categoryUuid" AS "categoryUuid", COALESCE(c.name, 'Senza categoria') AS "categoryName",
              t.type AS type, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t LEFT JOIN categories c ON c.uuid = t."categoryUuid"
       ${where}
       GROUP BY t."categoryUuid", c.name, t.type
       ORDER BY total DESC`,
      params,
    );

    // Mese dalla data del movimento (to_char: nessuno slittamento di fuso orario)
    const byMonth = await this.dataSource.query(
      `SELECT to_char(t.date, 'YYYY-MM') AS month,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'), 0) AS income,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense
       FROM transactions t ${where}
       GROUP BY 1 ORDER BY 1 DESC`,
      params,
    );

    const totalIncome = Number(totals.income);
    const totalExpense = Number(totals.expense);
    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      byCategory: byCategory.map((r: any) => ({
        categoryUuid: r.categoryUuid,
        categoryName: r.categoryName,
        type: r.type,
        total: Number(r.total),
      })),
      byMonth: byMonth.map((r: any) => ({
        month: r.month,
        income: Number(r.income),
        expense: Number(r.expense),
      })),
    };
  }
}
