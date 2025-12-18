import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { TransactionService } from './transaction.service';
import { Transaction, TransactionType, PaymentMethod } from './entities/transaction.entity';
import { CategoryService } from '../categories/category.service';
import { CategoryType } from '../categories/entities/category.entity';

interface ExcelTransactionRow {
  [key: string]: any;
}

// Mapping flessibile per i nomi delle colonne (alias -> nome standard)
const COLUMN_ALIASES: Record<string, string[]> = {
  data: ['data', 'date', 'data_operazione', 'data operazione', 'dataoperazione', 'data_movimento', 'data movimento'],
  tipo: ['tipo', 'type', 'tipologia', 'entrata_uscita', 'entrata/uscita', 'movimento'],
  importo: ['importo', 'amount', 'valore', 'totale', 'euro', 'eur', 'importo_euro', 'dare', 'avere'],
  importo_originale: ['importo_originale', 'original_amount', 'importo originale', 'uscite/entrate originali'],
  entrate: ['entrate', 'entrata', 'income', 'incasso', 'incassi', 'credito'],
  uscite: ['uscite', 'uscita', 'expense', 'spesa', 'spese', 'debito'],
  soggetto: ['soggetto', 'subject', 'cliente', 'fornitore', 'intestatario', 'nominativo', 'nome', 'ditta-ente-soggetto', 'ditta', 'ente', 'ragione sociale'],
  descrizione: ['descrizione', 'description', 'desc', 'causale', 'oggetto', 'motivo'],
  categoria: ['categoria', 'category', 'cat', 'tipo_spesa', 'voce'],
  metodo_pagamento: ['metodo_pagamento', 'metodo pagamento', 'payment_method', 'pagamento', 'metodo', 'modalita', 'modalità'],
  riferimento: ['riferimento', 'reference', 'ref', 'rif', 'codice'],
  numero_fattura: ['numero_fattura', 'numero fattura', 'invoice', 'fattura', 'n_fattura', 'num_fattura'],
  controparte: ['controparte', 'counterpart', 'banca', 'conto'],
  note: ['note', 'notes', 'annotazioni', 'commento', 'commenti'],
  note2: ['note2', 'notes2', 'annotazioni2'],
  voce_bilancio: ['voce_bilancio', 'voce bilancio', 'budget', 'budget_item', 'cdc', 'centro_costo'],
};

export interface ImportResult {
  imported: number;
  updated: number;
  errors: { row: number; error: string }[];
}

@Injectable()
export class ExcelImportService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly categoryService: CategoryService,
  ) {}

  async importFromFile(buffer: Buffer, filename?: string): Promise<ImportResult> {
    // xlsx supporta sia Excel (.xlsx, .xls) che CSV nativamente
    const isCsv = filename?.toLowerCase().endsWith('.csv');
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      codepage: isCsv ? 65001 : undefined, // UTF-8 per CSV
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Leggi tutte le righe come array di array per gestire header non in prima riga
    const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: null,
    });

    // Trova la riga header (cerca la prima riga con contenuto significativo)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      if (row && row.some((cell: any) => cell && String(cell).trim().length > 0)) {
        // Verifica se questa riga sembra un header (contiene parole chiave)
        const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join(' ');
        if (rowStr.includes('data') || rowStr.includes('date') || 
            rowStr.includes('importo') || rowStr.includes('tipo') ||
            rowStr.includes('descrizione') || rowStr.includes('causale')) {
          headerRowIndex = i;
          break;
        }
      }
    }

    // Estrai header
    const headers = allRows[headerRowIndex]?.map((h: any) => String(h || '').trim()) || [];
    
    // Converti le righe successive in oggetti
    const rows: ExcelTransactionRow[] = [];
    for (let i = headerRowIndex + 1; i < allRows.length; i++) {
      const rowData = allRows[i];
      if (!rowData || rowData.length === 0) continue;
      
      const obj: ExcelTransactionRow = {};
      for (let j = 0; j < headers.length; j++) {
        if (headers[j] && rowData[j] !== undefined && rowData[j] !== null) {
          obj[headers[j]] = rowData[j];
        }
      }
      rows.push(obj);
    }

    const result: ImportResult = {
      imported: 0,
      updated: 0,
      errors: [],
    };

    // Prepara le righe con i loro indici originali e normalizza
    const processedRows: { row: ExcelTransactionRow; originalIndex: number; date: Date | null }[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = this.normalizeRow(rows[i]);
      
      // Salta righe vuote
      if (Object.keys(row).length === 0 || !this.hasValidData(row)) {
        continue;
      }

      // Prova a parsare la data per l'ordinamento
      let date: Date | null = null;
      try {
        if (row.data) {
          date = this.parseDate(row.data);
        }
      } catch {
        // Se la data non è valida, verrà gestita durante l'import
      }

      processedRows.push({
        row,
        originalIndex: i,
        date,
      });
    }

    // Ordina per data (le transazioni senza data valida vanno alla fine)
    processedRows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });

    // Processa le righe ordinate per data
    for (const { row, originalIndex } of processedRows) {
      const rowNumber = headerRowIndex + originalIndex + 2; // +2 perché Excel parte da 1 e aggiungiamo l'header

      try {
        const transaction = await this.rowToTransaction(row);
        
        // Cerca transazione esistente per data, importo e soggetto
        const existing = await this.findExistingTransaction(transaction);
        
        if (existing) {
          // Aggiorna transazione esistente
          await this.transactionService.update(existing.uuid, transaction as any);
          result.updated++;
        } else {
          // Crea nuova transazione
          await this.transactionService.createTransaction(transaction as any);
          result.imported++;
        }
      } catch (error) {
        result.errors.push({
          row: rowNumber,
          error: error.message || 'Errore sconosciuto',
        });
      }
    }

    return result;
  }

  private async rowToTransaction(row: ExcelTransactionRow): Promise<Partial<Transaction>> {
    const transaction: Partial<Transaction> = {};

    // Data
    if (row.data) {
      transaction.date = this.parseDate(row.data);
    } else {
      throw new Error('Data mancante');
    }

    // Importo e Tipo - gestisce sia colonna singola che colonne separate entrate/uscite
    let importoValue: number | null = null;
    
    // Caso 1: Colonne separate per entrate e uscite
    if (row.entrate !== undefined && row.entrate !== null && row.entrate !== '') {
      importoValue = this.parseNumber(row.entrate);
      transaction.amount = Math.abs(importoValue);
      transaction.type = TransactionType.INCOME;
    } else if (row.uscite !== undefined && row.uscite !== null && row.uscite !== '') {
      importoValue = this.parseNumber(row.uscite);
      transaction.amount = Math.abs(importoValue);
      transaction.type = TransactionType.EXPENSE;
    }
    // Caso 2: Colonna singola importo
    else if (row.importo !== undefined && row.importo !== null && row.importo !== '') {
      importoValue = this.parseNumber(row.importo);
      transaction.amount = Math.abs(importoValue);
      // Il tipo verrà determinato sotto
    }
    
    if (importoValue === null || transaction.amount === undefined) {
      throw new Error('Importo mancante');
    }

    // Se il tipo non è già stato determinato dalle colonne entrate/uscite
    if (!transaction.type) {
      if (row.tipo) {
        const tipoUpper = String(row.tipo).toUpperCase().trim();
        
        // Verifica se è un tipo di transazione esplicito
        if (tipoUpper === 'ENTRATA' || tipoUpper === 'INCOME' || tipoUpper === 'E' || tipoUpper === '+') {
          transaction.type = TransactionType.INCOME;
        } else if (tipoUpper === 'USCITA' || tipoUpper === 'EXPENSE' || tipoUpper === 'U' || tipoUpper === '-') {
          transaction.type = TransactionType.EXPENSE;
        } else if (['BANCA', 'CONTANTI', 'ASSEGNO', 'CARTA', 'BONIFICO', 'CASH', 'CHECK'].includes(tipoUpper)) {
          // È un metodo di pagamento, non un tipo - determina dal segno dell'importo
          transaction.paymentMethod = this.parsePaymentMethod(row.tipo);
          transaction.type = importoValue >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
        } else {
          // Prova a determinare dal segno dell'importo
          transaction.type = importoValue >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
        }
      } else {
        // Nessuna colonna tipo - determina dal segno dell'importo
        transaction.type = importoValue >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
      }
    }
    
    // Se abbiamo la colonna tipo ma il tipo è già stato determinato, usa tipo come metodo pagamento
    if (transaction.type && row.tipo && !transaction.paymentMethod) {
      const tipoUpper = String(row.tipo).toUpperCase().trim();
      if (['BANCA', 'CONTANTI', 'ASSEGNO', 'CARTA', 'BONIFICO', 'CASH', 'CHECK'].includes(tipoUpper)) {
        transaction.paymentMethod = this.parsePaymentMethod(row.tipo);
      }
    }

    // Importo originale (opzionale)
    if (row.importo_originale !== undefined && row.importo_originale !== null) {
      transaction.originalAmount = this.parseNumber(row.importo_originale);
    }

    // Soggetto
    if (row.soggetto) {
      transaction.subject = String(row.soggetto).trim();
    }

    // Descrizione
    if (row.descrizione) {
      transaction.description = String(row.descrizione).trim();
    }

    // Categoria - trova o crea
    if (row.categoria) {
      const categoryName = String(row.categoria).trim();
      const category = await this.categoryService.findOrCreateByName(categoryName, CategoryType.BOTH);
      transaction.categoryUuid = category.uuid;
    }

    // Metodo di pagamento
    if (row.metodo_pagamento) {
      transaction.paymentMethod = this.parsePaymentMethod(row.metodo_pagamento);
    }

    // Riferimento
    if (row.riferimento) {
      transaction.reference = String(row.riferimento).trim();
    }

    // Numero fattura
    if (row.numero_fattura) {
      transaction.invoiceNumber = String(row.numero_fattura).trim();
    }

    // Controparte
    if (row.controparte) {
      transaction.counterpart = String(row.controparte).trim();
    }

    // Note
    if (row.note) {
      transaction.notes = String(row.note).trim();
    }

    // Note2
    if (row.note2) {
      transaction.notes2 = String(row.note2).trim();
    }

    // Voce bilancio
    if (row.voce_bilancio) {
      transaction.budgetItem = String(row.voce_bilancio).trim();
    }

    return transaction;
  }

  private parseDate(value: string | number): Date {
    if (typeof value === 'number') {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(value);
      return new Date(date.y, date.m - 1, date.d);
    }
    
    const str = String(value).trim();
    
    // Prova diversi formati di data
    // DD/MM/YYYY
    let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    
    // YYYY-MM-DD
    match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    
    // Prova parsing nativo
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    throw new Error(`Formato data non valido: ${value}`);
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    
    const str = String(value).trim().replace(',', '.').replace(/[€\s]/g, '');
    const num = parseFloat(str);
    
    if (isNaN(num)) {
      throw new Error(`Numero non valido: ${value}`);
    }
    
    return num;
  }

  private parsePaymentMethod(value: string): PaymentMethod {
    const normalized = String(value).toUpperCase().trim();
    
    const mapping: Record<string, PaymentMethod> = {
      'CONTANTI': PaymentMethod.CASH,
      'CASH': PaymentMethod.CASH,
      'CASSA': PaymentMethod.CASH,
      'BANCA': PaymentMethod.BANK_TRANSFER,
      'BONIFICO': PaymentMethod.BANK_TRANSFER,
      'BONIFICO BANCARIO': PaymentMethod.BANK_TRANSFER,
      'BANK_TRANSFER': PaymentMethod.BANK_TRANSFER,
      'BANK': PaymentMethod.BANK_TRANSFER,
      'CARTA': PaymentMethod.CREDIT_CARD,
      'CREDIT_CARD': PaymentMethod.CREDIT_CARD,
      'CARTA DI CREDITO': PaymentMethod.CREDIT_CARD,
      'BANCOMAT': PaymentMethod.CREDIT_CARD,
      'POS': PaymentMethod.CREDIT_CARD,
      'ASSEGNO': PaymentMethod.CHECK,
      'CHECK': PaymentMethod.CHECK,
      'ALTRO': PaymentMethod.OTHER,
      'OTHER': PaymentMethod.OTHER,
    };
    
    return mapping[normalized] || PaymentMethod.OTHER;
  }

  private async findExistingTransaction(transaction: Partial<Transaction>): Promise<Transaction | null> {
    // Cerca per data + importo + soggetto (chiave univoca logica)
    const queryBuilder = this.transactionService.getQueryBuilder('t');
    
    queryBuilder.where('t.date = :date', { date: transaction.date });
    queryBuilder.andWhere('t.amount = :amount', { amount: transaction.amount });
    queryBuilder.andWhere('t.type = :type', { type: transaction.type });
    
    if (transaction.subject) {
      queryBuilder.andWhere('t.subject = :subject', { subject: transaction.subject });
    } else {
      queryBuilder.andWhere('t.subject IS NULL');
    }
    
    return queryBuilder.getOne();
  }

  /**
   * Normalizza una riga mappando i nomi delle colonne agli alias standard
   */
  private normalizeRow(row: ExcelTransactionRow): ExcelTransactionRow {
    const normalized: ExcelTransactionRow = {};
    
    for (const [originalKey, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') continue;
      
      const normalizedKey = originalKey.toLowerCase().trim();
      
      // Cerca se questa chiave corrisponde a un alias
      let mappedKey: string | null = null;
      for (const [standardKey, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(normalizedKey)) {
          mappedKey = standardKey;
          break;
        }
      }
      
      // Usa la chiave mappata o quella originale normalizzata
      const finalKey = mappedKey || normalizedKey;
      normalized[finalKey] = value;
    }
    
    return normalized;
  }

  /**
   * Verifica se una riga ha dati validi (almeno data o importo)
   */
  private hasValidData(row: ExcelTransactionRow): boolean {
    // Una riga è valida se ha almeno una data o un importo
    const hasData = row.data !== undefined && row.data !== null && row.data !== '';
    const hasImporto = row.importo !== undefined && row.importo !== null && row.importo !== '';
    return hasData || hasImporto;
  }
}
