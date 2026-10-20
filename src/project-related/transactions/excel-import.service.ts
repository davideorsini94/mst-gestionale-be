import { Injectable } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { AmountReviewStatus, Transaction, TransactionType, PaymentMethod } from './entities/transaction.entity';
import { CategoryService } from '../categories/category.service';
import { CategoryType } from '../categories/entities/category.entity';
import { blindIndex } from '../../common/crypto/field-crypto';
import {
  DecimalSeparator,
  detectDecimalSeparator,
  legacyStoredAmount,
  parseAmountCell,
} from './import/amount-parser';
import { parseDateCell, readFirstSheet, SheetCell } from './import/sheet-reader';

type ExcelRow = Record<string, SheetCell>;

// Mapping flessibile per i nomi delle colonne (alias -> nome standard), confronto esatto dopo normalizzazione
const COLUMN_ALIASES: Record<string, string[]> = {
  data: ['data', 'date', 'data_operazione', 'data operazione', 'dataoperazione', 'data_movimento', 'data movimento', 'data contabile', 'data_contabile', 'data valuta', 'data_valuta'],
  tipo: ['tipo', 'type', 'tipologia', 'entrata_uscita', 'entrata/uscita', 'movimento'],
  importo: ['importo', 'amount', 'valore', 'totale', 'euro', 'eur', 'importo_euro'],
  importo_originale: ['importo_originale', 'original_amount', 'importo originale', 'uscite/entrate originali'],
  // Negli estratti conto "dare" = addebito (uscita), "avere" = accredito (entrata)
  entrate: ['entrate', 'entrata', 'income', 'incasso', 'incassi', 'credito', 'avere', 'accrediti'],
  uscite: ['uscite', 'uscita', 'expense', 'spesa', 'spese', 'debito', 'dare', 'addebiti'],
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

const AMOUNT_COLUMNS = ['importo', 'importo_originale', 'entrate', 'uscite'];
const PAYMENT_METHOD_WORDS = ['BANCA', 'CONTANTI', 'ASSEGNO', 'CARTA', 'BONIFICO', 'CASH', 'CHECK'];

export interface ImportResult {
  imported: number;
  updated: number;
  /** Righe già presenti con l'importo rovinato dal vecchio import: corrette con il valore del file */
  corrected: number;
  errors: { row: number; error: string }[];
}

interface ParsedRow {
  rowNumber: number;
  transaction: Partial<Transaction>;
  /** Importo che il vecchio parser v1.3 avrebbe salvato per questa riga */
  legacyAmount: number | null;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const ALIAS_TO_KEY = new Map<string, string>();
for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_KEY.set(alias, key);
}

@Injectable()
export class ExcelImportService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly categoryService: CategoryService,
  ) { }

  async importFromFile(buffer: Buffer, _filename?: string): Promise<ImportResult> {
    const { rows: allRows, date1904 } = readFirstSheet(buffer);
    const result: ImportResult = { imported: 0, updated: 0, corrected: 0, errors: [] };

    const headerRowIndex = this.findHeaderRow(allRows);
    const headerKeys = (allRows[headerRowIndex] ?? []).map((cell) =>
      cell ? ALIAS_TO_KEY.get(normalizeHeader(cell.w ?? cell.v)) ?? normalizeHeader(cell.w ?? cell.v) : null,
    );

    const rows: { row: ExcelRow; rowNumber: number }[] = [];
    for (let i = headerRowIndex + 1; i < allRows.length; i++) {
      const row: ExcelRow = {};
      allRows[i].forEach((cell, j) => {
        const key = headerKeys[j];
        if (key && cell && !(key in row)) row[key] = cell;
      });
      if (this.hasValidData(row)) rows.push({ row, rowNumber: i + 1 });
    }

    // Separatore decimale di ogni colonna importo dedotto dai valori non ambigui (risolve "1.234" vs "1,234")
    const decimalHints: Record<string, DecimalSeparator | undefined> = {};
    for (const col of AMOUNT_COLUMNS) {
      const texts = rows.map((r) => r.row[col]).filter((c) => c && c.t === 's').map((c) => String(c.v));
      decimalHints[col] = detectDecimalSeparator(texts);
    }

    const parsed: ParsedRow[] = [];
    for (const { row, rowNumber } of rows) {
      try {
        const { transaction, legacyAmount } = await this.rowToTransaction(row, date1904, decimalHints);
        parsed.push({ rowNumber, transaction, legacyAmount });
      } catch (error) {
        result.errors.push({ row: rowNumber, error: error.message || 'Errore sconosciuto' });
      }
    }

    // Inverti l'ordine delle righe: le righe dal basso dell'Excel vengono inserite prima
    // così le righe in alto avranno created_at più recente
    parsed.reverse();

    // Righe identiche nello stesso file sono movimenti distinti: la k-esima occorrenza si abbina alla k-esima
    // riga esistente, mai la stessa riga due volte
    const usedUuids = new Set<string>();
    for (const item of parsed) {
      try {
        const outcome = await this.upsert(item, usedUuids);
        result[outcome]++;
      } catch (error) {
        result.errors.push({ row: item.rowNumber, error: error.message || 'Errore sconosciuto' });
      }
    }

    result.errors.sort((a, b) => a.row - b.row);
    return result;
  }

  private findHeaderRow(rows: (SheetCell | null)[][]): number {
    // 1) la prima riga con almeno due intestazioni riconosciute esattamente
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const known = rows[i].filter((c) => c && ALIAS_TO_KEY.has(normalizeHeader(c.w ?? c.v))).length;
      if (known >= 2) return i;
    }
    // 2) compatibilità con i file importati finora: prima riga che contiene parole chiave
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const rowStr = rows[i].map((c) => normalizeHeader(c?.w ?? c?.v)).join(' ');
      if (['data', 'date', 'importo', 'tipo', 'descrizione', 'causale'].some((k) => rowStr.includes(k))) return i;
    }
    return 0;
  }

  private async upsert(item: ParsedRow, usedUuids: Set<string>): Promise<'imported' | 'updated' | 'corrected'> {
    const tx = item.transaction;
    const subjectHash = blindIndex(tx.subject ?? null, 'exact');

    let existing = await this.findCandidate(tx, tx.amount, subjectHash, usedUuids, false);
    let isLegacyMatch = false;
    if (!existing && item.legacyAmount !== null && item.legacyAmount !== tx.amount) {
      existing = await this.findCandidate(tx, item.legacyAmount, subjectHash, usedUuids, true);
      isLegacyMatch = !!existing;
    }

    if (!existing) {
      const created = await this.transactionService.createTransaction(tx as any);
      // una riga identica più avanti nello stesso file è un altro movimento: non deve abbinarsi a questa
      usedUuids.add(created.uuid);
      return 'imported';
    }
    usedUuids.add(existing.uuid);

    const update: Partial<Transaction> = { ...tx };
    const amountChanged = Number(existing.amount) !== Number(tx.amount);
    if (isLegacyMatch && amountChanged) {
      // Importo rovinato dal vecchio import: si conserva il valore precedente per l'annullamento
      update.amountReview = AmountReviewStatus.CORRECTED;
      update.amountBeforeReview = existing.amountBeforeReview ?? existing.amount;
      update.originalAmountBeforeReview = existing.originalAmountBeforeReview ?? existing.originalAmount;
      update.amountReviewedAt = new Date();
    }

    if (tx.type === TransactionType.INCOME && amountChanged) {
      // La ricevuta riporta l'importo: va rigenerata (stesso numero)
      await this.transactionService.updateTransaction(existing.uuid, update as any);
    } else {
      await this.transactionService.update(existing.uuid, update as any);
    }
    return isLegacyMatch ? 'corrected' : 'updated';
  }

  /** Cerca per data + tipo + importo + soggetto (blind index) la prima riga non ancora abbinata. */
  private async findCandidate(
    tx: Partial<Transaction>,
    amount: number,
    subjectHash: string | null,
    usedUuids: Set<string>,
    includeReviewed: boolean,
  ): Promise<Transaction | null> {
    const qb = this.transactionService.getQueryBuilder('t')
      .addSelect('t.subjectHash')
      .where('t.date = :date', { date: tx.date })
      .andWhere('t.type = :type', { type: tx.type });

    if (includeReviewed) {
      // valore salvato dal vecchio parser, anche se nel frattempo corretto a mano dalla revisione importi
      qb.andWhere('(t.amount = :amount OR t.amountBeforeReview = :amount)', { amount });
    } else {
      qb.andWhere('t.amount = :amount', { amount });
    }
    if (subjectHash) {
      qb.andWhere('t.subjectHash = :subjectHash', { subjectHash });
    } else {
      qb.andWhere('t.subjectHash IS NULL');
    }
    if (usedUuids.size) {
      qb.andWhere('t.uuid NOT IN (:...used)', { used: Array.from(usedUuids) });
    }
    return qb.orderBy('t.createdAt', 'ASC').getOne();
  }

  private cellText(cell: SheetCell | undefined): string | undefined {
    if (!cell) return undefined;
    // per codici e riferimenti si usa il testo mostrato da Excel (conserva gli zeri iniziali)
    const text = cell.t === 'n' && cell.w !== undefined ? cell.w : String(cell.v);
    const trimmed = text.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  private isZeroOrEmpty(cell: SheetCell | undefined, hint?: DecimalSeparator): boolean {
    if (!cell) return true;
    if (typeof cell.v === 'number') return cell.v === 0;
    const text = String(cell.v).trim();
    // zero in formato contabile: "-", "€ -", "- €"
    if (/^[€\s -]*$/.test(text)) return true;
    try {
      return parseAmountCell(cell.v, hint) === 0;
    } catch {
      return false;
    }
  }

  private async rowToTransaction(
    row: ExcelRow,
    date1904: boolean,
    hints: Record<string, DecimalSeparator | undefined>,
  ): Promise<{ transaction: Partial<Transaction>; legacyAmount: number | null }> {
    const transaction: Partial<Transaction> = {};

    // Data
    if (!row.data) throw new Error('Data mancante');
    transaction.date = parseDateCell(row.data.v, date1904) as any;

    // Importo e Tipo - gestisce sia colonna singola che colonne separate entrate/uscite (0 = vuoto)
    let amountCell: SheetCell | undefined;
    let importoValue: number | null = null;
    if (!this.isZeroOrEmpty(row.entrate, hints.entrate)) {
      amountCell = row.entrate;
      importoValue = parseAmountCell(row.entrate.v, hints.entrate);
      transaction.type = TransactionType.INCOME;
    } else if (!this.isZeroOrEmpty(row.uscite, hints.uscite)) {
      amountCell = row.uscite;
      importoValue = parseAmountCell(row.uscite.v, hints.uscite);
      transaction.type = TransactionType.EXPENSE;
    } else if (row.importo) {
      amountCell = row.importo;
      importoValue = parseAmountCell(row.importo.v, hints.importo);
    }

    if (importoValue === null) {
      throw new Error('Importo mancante');
    }
    transaction.amount = Math.abs(importoValue);

    const tipo = this.cellText(row.tipo);
    const tipoUpper = tipo?.toUpperCase();

    // Se il tipo non è già stato determinato dalle colonne entrate/uscite
    if (!transaction.type) {
      if (tipoUpper === 'ENTRATA' || tipoUpper === 'INCOME' || tipoUpper === 'E' || tipoUpper === '+') {
        transaction.type = TransactionType.INCOME;
      } else if (tipoUpper === 'USCITA' || tipoUpper === 'EXPENSE' || tipoUpper === 'U' || tipoUpper === '-') {
        transaction.type = TransactionType.EXPENSE;
      } else {
        // Determina dal segno dell'importo (anche quando "tipo" è un metodo di pagamento)
        transaction.type = importoValue >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
      }
    }

    // La colonna tipo può contenere il metodo di pagamento
    if (tipoUpper && PAYMENT_METHOD_WORDS.includes(tipoUpper)) {
      transaction.paymentMethod = this.parsePaymentMethod(tipo);
    }

    // Importo originale (opzionale)
    if (row.importo_originale && !this.isZeroOrEmpty(row.importo_originale, hints.importo_originale)) {
      transaction.originalAmount = parseAmountCell(row.importo_originale.v, hints.importo_originale);
    }

    const text = (key: string) => this.cellText(row[key]);
    if (text('soggetto')) transaction.subject = text('soggetto');
    if (text('descrizione')) transaction.description = text('descrizione');

    // Categoria - trova o crea
    if (text('categoria')) {
      const category = await this.categoryService.findOrCreateByName(text('categoria'), CategoryType.BOTH);
      transaction.categoryUuid = category.uuid;
    }

    if (text('metodo_pagamento')) transaction.paymentMethod = this.parsePaymentMethod(text('metodo_pagamento'));
    if (text('riferimento')) transaction.reference = text('riferimento');
    if (text('numero_fattura')) transaction.invoiceNumber = text('numero_fattura');
    if (text('controparte')) transaction.counterpart = text('controparte');
    if (text('note')) transaction.notes = text('note');
    if (text('note2')) transaction.notes2 = text('note2');
    if (text('voce_bilancio')) transaction.budgetItem = text('voce_bilancio');

    return {
      transaction,
      legacyAmount: amountCell ? legacyStoredAmount(amountCell.w ?? amountCell.v, amountCell.v) : null,
    };
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

  /**
   * Verifica se una riga ha dati validi (almeno data o importo)
   */
  private hasValidData(row: ExcelRow): boolean {
    // Come nella v1.3: le righe senza data né importo (es. totali con sole entrate/uscite) vengono saltate
    return !!(row.data || row.importo);
  }
}
