import * as XLSX from 'xlsx';
import { decodeWindows1252, parseDateCell, readFirstSheet } from './sheet-reader';
import { detectDecimalSeparator, legacyStoredAmount, parseAmountCell } from './amount-parser';

function xlsxBuffer(rows: any[][], numberFormat?: string, opts: { date1904?: boolean } = {}): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (numberFormat) {
    for (let r = 1; r < rows.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = numberFormat;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimenti');
  if (opts.date1904) wb.Workbook = { WBProps: { date1904: true } } as any;
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('readFirstSheet + parser: il bug delle migliaia', () => {
  it('xlsx con formato #,##0.00: l\'importo è il numero vero, il vecchio parser dava 1,23', () => {
    const buffer = xlsxBuffer([['Data', 'Importo'], [45366, 1234.56], [45367, 5560], [45368, 999.99]], '#,##0.00');
    const { rows } = readFirstSheet(buffer);
    const amounts = rows.slice(1).map((r) => r[1]);
    expect(amounts.map((c) => parseAmountCell(c.v))).toEqual([1234.56, 5560, 999.99]);
    // il testo formattato è quello che leggeva la v1.3
    expect(amounts.map((c) => legacyStoredAmount(c.w, c.v))).toEqual([1.23, 5.56, 999.99]);
  });

  it('xlsx con importi scritti come testo italiano', () => {
    const buffer = xlsxBuffer([['Data', 'Importo'], ['15/03/2024', '1.234,56'], ['16/03/2024', '12,50']]);
    const { rows } = readFirstSheet(buffer);
    const texts = rows.slice(1).map((r) => String(r[1].v));
    const hint = detectDecimalSeparator(texts);
    expect(hint).toBe(',');
    expect(rows.slice(1).map((r) => parseAmountCell(r[1].v, hint))).toEqual([1234.56, 12.5]);
    expect(rows.slice(1).map((r) => parseDateCell(r[0].v))).toEqual(['2024-03-15', '2024-03-16']);
  });

  it('date seriali, anche con il sistema 1904', () => {
    expect(parseDateCell(45366)).toBe('2024-03-15');
    expect(parseDateCell(45366.9999)).toBe('2024-03-15');
    const buffer = xlsxBuffer([['Data', 'Importo'], [43904, 10]], undefined, { date1904: true });
    const { rows, date1904 } = readFirstSheet(buffer);
    expect(date1904).toBe(true);
    expect(parseDateCell(rows[1][0].v, date1904)).toBe('2024-03-15');
  });

  it('date di testo: solo formati espliciti, giorno prima del mese', () => {
    expect(parseDateCell('04/03/2024')).toBe('2024-03-04');
    expect(parseDateCell('4.3.24')).toBe('2024-03-04');
    expect(parseDateCell('2024-03-04')).toBe('2024-03-04');
    expect(parseDateCell('2024-03-04T00:00:00Z')).toBe('2024-03-04');
    expect(() => parseDateCell('31/02/2024')).toThrow();
    expect(() => parseDateCell('March 4, 2024')).toThrow();
  });

  it('CSV italiano con ; e BOM UTF-8: niente interpretazione automatica di SheetJS', () => {
    const csv = '﻿Data;Soggetto;Importo\n04/03/2024;Società Sci;1.234,56\n05/03/2024;Bar;-12,50\n';
    const { rows } = readFirstSheet(Buffer.from(csv, 'utf8'));
    expect(rows[0].map((c) => c?.v)).toEqual(['Data', 'Soggetto', 'Importo']);
    expect(rows[1][1].v).toBe('Società Sci');
    expect(parseDateCell(rows[1][0].v)).toBe('2024-03-04');
    expect(parseAmountCell(rows[1][2].v, ',')).toBe(1234.56);
    expect(parseAmountCell(rows[2][2].v, ',')).toBe(-12.5);
  });

  it('CSV windows-1252 salvato come .xls', () => {
    const csv = 'Data;Soggetto;Importo\r\n04/03/2024;Società;1.000,00\r\n';
    const buffer = Buffer.from(new Uint8Array([...csv].map((ch) => (ch === 'à' ? 0xe0 : ch.charCodeAt(0)))));
    const { rows } = readFirstSheet(buffer);
    expect(rows[1][1].v).toBe('Società');
    expect(parseAmountCell(rows[1][2].v, ',')).toBe(1000);
  });

  it('windows-1252: € e apostrofo tipografico decodificati anche dove Node li legge come latin1', () => {
    const bytes = Buffer.from([0x80, 0x20, 0x32, 0x2e, 0x30, 0x30, 0x30, 0x2c, 0x30, 0x30, 0x3b, 0x44, 0x92, 0x41]);
    expect(decodeWindows1252(bytes)).toBe('€ 2.000,00;D’A');
  });

  it('anni: due cifre completate, quattro cifre prese alla lettera e fuori intervallo rifiutati', () => {
    expect(parseDateCell('1/1/99')).toBe('1999-01-01');
    expect(parseDateCell('1/1/24')).toBe('2024-01-01');
    expect(() => parseDateCell('1/1/0099')).toThrow();
    expect(() => parseDateCell('2500-01-01')).toThrow();
  });
});
