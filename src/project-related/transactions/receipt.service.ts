import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { MinioService } from '../../minio/minio.service';
import { dataSource } from '../../datasources/data-source';
import { EntityManager, Repository } from 'typeorm';
import { AnnulledReceipt } from './entities/annulled-receipt.entity';
import { decryptString, isEncryptedValue } from '../../common/crypto/field-crypto';

/** Ricevuta annullata o numero tenuto da un duplicato archiviato (elenco unico per l'interfaccia). */
export interface AnnulledReceiptView {
  uuid: string;
  source: 'annullata' | 'duplicato';
  receiptYear: number;
  receiptNumber: number;
  date: string | null;
  amount: number | null;
  subject: string | null;
  reason: string;
  annulledAt: string;
  hasPdf: boolean;
}

/** Chiave dei lock Postgres (pg_advisory_xact_lock) per la numerazione delle ricevute, uno per anno. */
const RECEIPT_LOCK_KEY = 47211;

/** Anno della data del movimento senza passare dal fuso orario ('YYYY-MM-DD' resta quell'anno). */
export function receiptYearOf(date: Date | string): number {
  if (typeof date === 'string' && /^\d{4}-/.test(date)) return Number(date.slice(0, 4));
  return new Date(date).getFullYear();
}

@Injectable()
export class ReceiptService {
  private readonly transactionRepo: Repository<Transaction>;
  private readonly annulledRepo: Repository<AnnulledReceipt>;

  constructor(private readonly minioService: MinioService) {
    this.transactionRepo = dataSource.getRepository(Transaction);
    this.annulledRepo = dataSource.getRepository(AnnulledReceipt);
  }

  /**
   * Percorso della ricevuta: nessun dato personale nel nome (il PDF è comunque cifrato). Il numero è nel nome: una
   * ricevuta annullata e quella riemessa per lo stesso movimento non si sovrascrivono.
   */
  private receiptPath(transaction: Transaction, year: number, receiptNumber: number): string {
    return `ricevute/${year}/${transaction.uuid}-${receiptNumber}.pdf`;
  }

  /** Una sola operazione sulla ricevuta per movimento alla volta (modifiche/cancellazioni contemporanee). */
  private readonly locks = new Map<string, Promise<unknown>>();

  async withTransactionLock<T>(transactionUuid: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(transactionUuid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(transactionUuid, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(transactionUuid) === run) this.locks.delete(transactionUuid);
    }
  }

  /** Cancella la vecchia ricevuta solo se il nuovo PDF è stato salvato in un percorso diverso. */
  private async deleteIfReplaced(oldPath: string | null | undefined, newPath: string): Promise<void> {
    if (oldPath && oldPath !== newPath) {
      try {
        await this.minioService.deleteFile(oldPath);
      } catch (error) {
        console.error(`[ReceiptService] Error deleting old receipt ${oldPath}:`, error);
      }
    }
  }

  private getAssetsPath(): string {
    return path.join(__dirname, 'assets');
  }

  /**
   * Massimo numero mai usato nell'anno: movimenti, ricevute annullate e duplicati archiviati (ripristinabili).
   * I numeri emessi non si riusano: una ricevuta consegnata non deve mai avere lo stesso numero di un'altra.
   */
  private async maxUsedNumber(manager: EntityManager, year: number): Promise<number> {
    const [row] = await manager.query(
      `SELECT GREATEST(
         COALESCE((SELECT MAX("receiptNumber") FROM transactions WHERE "receiptYear" = $1), 0),
         COALESCE((SELECT MAX("receiptNumber") FROM annulled_receipts WHERE "receiptYear" = $1), 0),
         COALESCE((SELECT MAX((data->>'receiptNumber')::int) FROM transactions_removed_duplicates
                   WHERE (data->>'receiptYear')::int = $1), 0)
       ) AS max`,
      [year],
    );
    return Number(row?.max) || 0;
  }

  /**
   * Assegna al movimento il prossimo numero dell'anno e lo salva nella stessa transazione, sotto un lock Postgres per
   * anno: due entrate create insieme (o due import) non possono prendere lo stesso numero.
   */
  private async assignNextNumber(transactionUuid: string, year: number): Promise<number> {
    return dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [RECEIPT_LOCK_KEY, year]);
      const next = (await this.maxUsedNumber(manager, year)) + 1;
      await manager.query(`UPDATE transactions SET "receiptNumber" = $1, "receiptYear" = $2 WHERE uuid = $3`, [
        next,
        year,
        transactionUuid,
      ]);
      return next;
    });
  }

  /**
   * Annulla la ricevuta emessa per un movimento (cancellato, diventato uscita o spostato in un altro anno): numero e PDF
   * restano nell'archivio delle ricevute annullate, il numero non viene riassegnato.
   */
  async annulReceipt(transaction: Transaction, reason: string): Promise<void> {
    if (!transaction.receiptNumber || !transaction.receiptYear) return;
    // già annullata (es. richiesta ripetuta): una sola riga per numero
    const existing = await this.annulledRepo.count({
      where: { receiptYear: transaction.receiptYear, receiptNumber: transaction.receiptNumber },
    });
    if (existing) return;
    await this.annulledRepo.save(
      this.annulledRepo.create({
        transactionUuid: transaction.uuid,
        receiptYear: transaction.receiptYear,
        receiptNumber: transaction.receiptNumber,
        date: transaction.date ? String(transaction.date).slice(0, 10) : null,
        amount: transaction.amount,
        subject: transaction.subject ?? null,
        minioPath: transaction.receiptMinioPath ?? null,
        reason,
      }),
    );
  }

  /**
   * Numeri non più in uso: ricevute annullate e numeri dei duplicati archiviati dalla manutenzione (ripristinabili).
   * Nessun numero sparisce senza traccia.
   */
  async listAnnulled(year?: number): Promise<AnnulledReceiptView[]> {
    const annulled = await this.annulledRepo.find({ where: year ? { receiptYear: year } : {} });
    const archived: any[] = await dataSource.query(
      `SELECT uuid::text AS uuid, "removedAt", data FROM transactions_removed_duplicates
       WHERE data->>'receiptNumber' IS NOT NULL ${year ? `AND (data->>'receiptYear')::int = $1` : ''}`,
      year ? [year] : [],
    );
    const decrypt = (v: unknown) =>
      typeof v === 'string' && isEncryptedValue(v) ? decryptString(v, 'transactions.subject') : (v as string) ?? null;
    const rows: AnnulledReceiptView[] = [
      ...annulled.map((a) => ({
        uuid: a.uuid,
        source: 'annullata' as const,
        receiptYear: a.receiptYear,
        receiptNumber: a.receiptNumber,
        date: a.date,
        amount: a.amount === null ? null : Number(a.amount),
        subject: a.subject,
        reason: a.reason,
        annulledAt: new Date(a.annulledAt).toISOString(),
        hasPdf: !!a.minioPath,
      })),
      ...archived.map((r) => ({
        uuid: r.uuid,
        source: 'duplicato' as const,
        receiptYear: Number(r.data.receiptYear),
        receiptNumber: Number(r.data.receiptNumber),
        date: r.data.date ? String(r.data.date).slice(0, 10) : null,
        amount: r.data.amount === null ? null : Number(r.data.amount),
        subject: decrypt(r.data.subject),
        reason: 'Duplicato da import archiviato (ripristinabile da Manutenzione dati)',
        annulledAt: new Date(r.removedAt).toISOString(),
        hasPdf: !!r.data.receiptMinioPath,
      })),
    ];
    return rows.sort((a, b) => b.receiptYear - a.receiptYear || b.receiptNumber - a.receiptNumber);
  }

  /** Percorso del PDF di una ricevuta annullata o di un duplicato archiviato. */
  async annulledPdfPath(uuid: string): Promise<{ path: string; receiptNumber: number; receiptYear: number } | null> {
    const a = await this.annulledRepo.findOne({ where: { uuid } });
    if (a?.minioPath) return { path: a.minioPath, receiptNumber: a.receiptNumber, receiptYear: a.receiptYear };
    const [r] = await dataSource.query(
      `SELECT data->>'receiptMinioPath' AS path, (data->>'receiptNumber')::int AS n, (data->>'receiptYear')::int AS y
       FROM transactions_removed_duplicates WHERE uuid = $1`,
      [uuid],
    );
    return r?.path ? { path: r.path, receiptNumber: r.n, receiptYear: r.y } : null;
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
    const year = receiptYearOf(transaction.date);
    const receiptNumber = await this.assignNextNumber(transaction.uuid, year);
    transaction.receiptNumber = receiptNumber;
    transaction.receiptYear = year;

    const pdfBuffer = await this.generateReceiptPdf(transaction);
    const minioPath = await this.minioService.uploadFile(
      this.receiptPath(transaction, year, receiptNumber),
      pdfBuffer,
      'application/pdf',
    );
    return { minioPath, receiptNumber, receiptYear: year };
  }

  /**
   * Rigenera il PDF con lo stesso numero. Se l'anno della data è cambiato, la ricevuta emessa (com'era prima della
   * modifica: `before`) viene annullata e il movimento prende un nuovo numero nel nuovo anno; un'entrata senza numero
   * ne riceve uno. Il PDF annullato resta dov'è (il percorso contiene il numero).
   */
  async updateReceipt(
    transaction: Transaction,
    before?: Transaction,
  ): Promise<{ minioPath: string; receiptNumber: number; receiptYear: number }> {
    const oldPath = transaction.receiptMinioPath;
    const year = receiptYearOf(transaction.date);
    let keepOldPdf = false;

    if (!transaction.receiptNumber || transaction.receiptYear !== year) {
      if (transaction.receiptNumber) {
        const issued = before?.receiptNumber === transaction.receiptNumber ? before : transaction;
        await this.annulReceipt(issued, `Data spostata dal ${transaction.receiptYear} al ${year}`);
        keepOldPdf = true;
      }
      transaction.receiptNumber = await this.assignNextNumber(transaction.uuid, year);
      transaction.receiptYear = year;
    }

    // Prima si salva il nuovo PDF, poi si elimina il vecchio: se la generazione fallisce la ricevuta resta
    const pdfBuffer = await this.generateReceiptPdf(transaction);
    const minioPath = await this.minioService.uploadFile(
      this.receiptPath(transaction, year, transaction.receiptNumber),
      pdfBuffer,
      'application/pdf',
    );
    if (!keepOldPdf) await this.deleteIfReplaced(oldPath, minioPath);

    return { minioPath, receiptNumber: transaction.receiptNumber, receiptYear: year };
  }

  /** Il movimento ha già una ricevuta con lo stesso anno e numero di un altro? (dati vecchi / duplicati ripristinati) */
  async hasNumberConflict(transaction: Transaction): Promise<boolean> {
    if (!transaction.receiptNumber || !transaction.receiptYear) return false;
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS c FROM transactions WHERE "receiptYear" = $1 AND "receiptNumber" = $2 AND uuid <> $3`,
      [transaction.receiptYear, transaction.receiptNumber, transaction.uuid],
    );
    return row.c > 0;
  }

  async pdfExists(minioPath: string | null | undefined): Promise<boolean> {
    if (!minioPath) return false;
    try {
      return await this.minioService.fileExists(minioPath);
    } catch {
      return false;
    }
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
   * Rigenera i PDF delle ricevute di un anno mantenendo i numeri già emessi (non si rinumera mai). Le entrate senza
   * numero ricevono il successivo disponibile, in ordine di data.
   */
  async regenerateReceiptsForYear(year: number): Promise<{ regenerated: number; errors: string[] }> {
    const transactions = await this.transactionRepo
      .createQueryBuilder('t')
      .where('t.type = :type', { type: TransactionType.INCOME })
      .andWhere('EXTRACT(YEAR FROM t.date) = :year', { year })
      .orderBy('t.receiptNumber', 'ASC', 'NULLS LAST')
      .addOrderBy('t.date', 'ASC')
      .addOrderBy('t.createdAt', 'ASC')
      .getMany();

    const result = { regenerated: 0, errors: [] as string[] };
    for (const transaction of transactions) {
      try {
        const { minioPath } = await this.updateReceipt(transaction);
        if (transaction.receiptMinioPath !== minioPath) {
          await this.transactionRepo.update({ uuid: transaction.uuid }, { receiptMinioPath: minioPath });
        }
        result.regenerated++;
      } catch (error) {
        result.errors.push(`Transazione ${transaction.uuid}: ${error.message}`);
      }
    }

    console.log(`[ReceiptService] Rigenerate ${result.regenerated} ricevute per l'anno ${year} (numeri invariati)`);
    return result;
  }
}
