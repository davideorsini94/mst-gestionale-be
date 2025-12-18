import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { MinioService } from '../../minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { Repository } from 'typeorm';

@Injectable()
export class ReceiptService {
  private readonly transactionRepo: Repository<Transaction>;
  private receiptLock: Map<number, Promise<void>> = new Map(); // Lock per anno

  constructor(private readonly minioService: MinioService) {
    this.transactionRepo = dataSource.getRepository(Transaction);
  }

  // Metodo per acquisire il lock per un anno specifico
  private async acquireLock(year: number): Promise<() => void> {
    // Aspetta che eventuali operazioni precedenti per questo anno siano completate
    while (this.receiptLock.has(year)) {
      await this.receiptLock.get(year);
    }
    
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.receiptLock.set(year, lockPromise);
    
    return () => {
      this.receiptLock.delete(year);
      releaseLock!();
    };
  }

  private getAssetsPath(): string {
    return path.join(__dirname, 'assets');
  }

  async getNextReceiptNumber(year: number): Promise<number> {
    const result = await this.transactionRepo
      .createQueryBuilder('t')
      .select('MAX(t.receiptNumber)', 'maxNumber')
      .where('t.receiptYear = :year', { year })
      .andWhere('t.type = :type', { type: TransactionType.INCOME })
      .getRawOne();

    return (result?.maxNumber || 0) + 1;
  }

  async generateReceiptPdf(transaction: Transaction): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const assetsPath = this.getAssetsPath();
        const logoPath = path.join(assetsPath, 'MST2.jpg');
        const stampPath = path.join(assetsPath, 'Timbro SSD A RL.jpg');

        doc.image(logoPath, 50, 30, { width: 300 });

        doc.moveDown(6);

        const receiptNumber = transaction.receiptNumber || 1;
        const transactionDate = new Date(transaction.date);
        const formattedDate = `${transactionDate.getDate().toString().padStart(2, '0')}/${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}/${transactionDate.getFullYear()}`;

        doc.fontSize(12);

        doc.text('', 350, 80);
        doc.rect(350, 80, 180, 25).stroke();
        doc.text(`Ricevuta N°: ${receiptNumber}`, 355, 88, { width: 170, align: 'right' });

        doc.rect(350, 105, 180, 25).stroke();
        doc.text(`Data: ${formattedDate}`, 355, 113, { width: 170, align: 'right' });

        doc.moveDown(4);
        const startY = 180;

        doc.text('Tipologia di pagamento:', 50, startY);
        doc.rect(200, startY - 5, 340, 25).stroke();
        const paymentMethodLabel = this.getPaymentMethodLabel(transaction.paymentMethod);
        doc.text(paymentMethodLabel.toUpperCase(), 205, startY, { width: 330 });

        doc.text('Ricevuti da:', 50, startY + 35);
        doc.rect(200, startY + 30, 340, 25).stroke();
        doc.text((transaction.subject || '').toUpperCase(), 205, startY + 35, { width: 330 });

        doc.text('Importo:', 50, startY + 70);
        doc.rect(200, startY + 65, 340, 25).stroke();
        doc.text(`€ ${Number(transaction.amount).toFixed(2)}`, 205, startY + 70, { width: 330 });

        doc.text('per:', 50, startY + 105);
        doc.rect(200, startY + 100, 340, 25).stroke();
        doc.text(transaction.notes || '', 205, startY + 105, { width: 330 });

        doc.rect(50, startY + 145, 50, 25).stroke();
        doc.text('TOTALE', 55, startY + 152);
        doc.rect(100, startY + 145, 120, 25).stroke();
        doc.text(`€ ${Number(transaction.amount).toFixed(2)}`, 105, startY + 152, { width: 110, align: 'center' });

        doc.image(stampPath, 300, startY + 170, { width: 200 });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'Contanti',
      BANK_TRANSFER: 'Bonifico Bancario',
      CREDIT_CARD: 'Carta di Credito',
      CHECK: 'Assegno',
      OTHER: 'Altro',
    };
    return labels[method] || method;
  }

  async createAndUploadReceipt(transaction: Transaction): Promise<{ minioPath: string; receiptNumber: number; receiptYear: number }> {
    const transactionDate = new Date(transaction.date);
    const year = transactionDate.getFullYear();

    // Acquisisce il lock per l'anno per evitare race condition
    const releaseLock = await this.acquireLock(year);
    
    try {
      const receiptNumber = await this.getNextReceiptNumber(year);

      transaction.receiptNumber = receiptNumber;
      transaction.receiptYear = year;

      const pdfBuffer = await this.generateReceiptPdf(transaction);

      const sanitizedSubject = (transaction.subject || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const dateStr = `${year}${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}${transactionDate.getDate().toString().padStart(2, '0')}`;
      const filename = `ricevute/${year}/${receiptNumber}-${sanitizedSubject}_${dateStr}.pdf`;

      const minioPath = await this.minioService.uploadFile(filename, pdfBuffer, 'application/pdf');

      return { minioPath, receiptNumber, receiptYear: year };
    } finally {
      releaseLock();
    }
  }

  async updateReceipt(transaction: Transaction): Promise<{ minioPath: string; receiptNumber: number; receiptYear: number }> {
    if (transaction.receiptMinioPath) {
      try {
        await this.minioService.deleteFile(transaction.receiptMinioPath);
      } catch (error) {
        console.error('Error deleting old receipt:', error);
      }
    }

    const transactionDate = new Date(transaction.date);
    const year = transactionDate.getFullYear();

    let receiptNumber = transaction.receiptNumber;
    let receiptYear = transaction.receiptYear;

    // Se l'anno è cambiato, dobbiamo generare un nuovo numero con lock
    if (receiptYear !== year) {
      const releaseLock = await this.acquireLock(year);
      try {
        receiptNumber = await this.getNextReceiptNumber(year);
        receiptYear = year;
      } finally {
        releaseLock();
      }
    }

    transaction.receiptNumber = receiptNumber;
    transaction.receiptYear = receiptYear;

    const pdfBuffer = await this.generateReceiptPdf(transaction);

    const sanitizedSubject = (transaction.subject || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const dateStr = `${year}${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}${transactionDate.getDate().toString().padStart(2, '0')}`;
    const filename = `ricevute/${year}/${receiptNumber}-${sanitizedSubject}_${dateStr}.pdf`;

    const minioPath = await this.minioService.uploadFile(filename, pdfBuffer, 'application/pdf');

    return { minioPath, receiptNumber, receiptYear };
  }

  async deleteReceipt(minioPath: string): Promise<void> {
    if (minioPath) {
      try {
        await this.minioService.deleteFile(minioPath);
        console.log(`[ReceiptService] Receipt deleted from MinIO: ${minioPath}`);
      } catch (error) {
        console.error(`[ReceiptService] Error deleting receipt: ${minioPath}`, error);
      }
    }
  }

  async getReceiptStream(minioPath: string): Promise<any> {
    return this.minioService.getFile(minioPath);
  }

  /**
   * Rigenera tutte le ricevute per un anno specifico con numeri sequenziali corretti
   * Le transazioni vengono ordinate per data e ricevono numeri progressivi
   */
  async regenerateReceiptsForYear(year: number): Promise<{ regenerated: number; errors: string[] }> {
    const releaseLock = await this.acquireLock(year);
    
    try {
      // Trova tutte le transazioni INCOME per l'anno, ordinate per data
      const transactions = await this.transactionRepo
        .createQueryBuilder('t')
        .where('t.type = :type', { type: TransactionType.INCOME })
        .andWhere('EXTRACT(YEAR FROM t.date) = :year', { year })
        .orderBy('t.date', 'ASC')
        .addOrderBy('t.createdAt', 'ASC')
        .getMany();

      const result = { regenerated: 0, errors: [] as string[] };
      let receiptNumber = 1;

      for (const transaction of transactions) {
        try {
          // Elimina la vecchia ricevuta se esiste
          if (transaction.receiptMinioPath) {
            try {
              await this.minioService.deleteFile(transaction.receiptMinioPath);
            } catch (e) {
              // Ignora errori di eliminazione
            }
          }

          // Assegna il nuovo numero
          transaction.receiptNumber = receiptNumber;
          transaction.receiptYear = year;

          // Genera il nuovo PDF
          const pdfBuffer = await this.generateReceiptPdf(transaction);

          const transactionDate = new Date(transaction.date);
          const sanitizedSubject = (transaction.subject || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
          const dateStr = `${year}${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}${transactionDate.getDate().toString().padStart(2, '0')}`;
          const filename = `ricevute/${year}/${receiptNumber}-${sanitizedSubject}_${dateStr}.pdf`;

          const minioPath = await this.minioService.uploadFile(filename, pdfBuffer, 'application/pdf');

          // Aggiorna la transazione
          transaction.receiptMinioPath = minioPath;
          await this.transactionRepo.save(transaction);

          receiptNumber++;
          result.regenerated++;
        } catch (error) {
          result.errors.push(`Transazione ${transaction.uuid}: ${error.message}`);
        }
      }

      console.log(`[ReceiptService] Rigenerate ${result.regenerated} ricevute per l'anno ${year}`);
      return result;
    } finally {
      releaseLock();
    }
  }
}
