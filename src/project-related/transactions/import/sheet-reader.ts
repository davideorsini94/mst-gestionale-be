import * as XLSX from 'xlsx';

/** Cella letta dal foglio: valore grezzo (v), tipo (t) e testo come lo mostrava Excel (w). */
export interface SheetCell {
  v: unknown;
  t: string;
  w?: string;
}

export interface SheetData {
  rows: (SheetCell | null)[][];
  date1904: boolean;
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/**
 * Decodifica un file di testo (CSV, ".xls" che in realtà è CSV/HTML): BOM UTF-8/UTF-16, UTF-8 stretto, altrimenti
 * windows-1252 (CSV salvati da Excel italiano su Windows).
 */
export function decodeText(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return decodeWindows1252(buffer);
  }
}

/** 0x80–0x9F di windows-1252 (€, ’, “ ” …): alcune versioni di Node li decodificano come latin1 (caratteri di controllo). */
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

export function decodeWindows1252(buffer: Buffer): string {
  let out = '';
  for (const byte of buffer) out += String.fromCharCode(CP1252_HIGH[byte] ?? byte);
  return out;
}

/**
 * Legge il primo foglio. `raw: true` in XLSX.read: nei file di testo SheetJS non deve interpretare numeri e date
 * (leggerebbe "1.234,56" come 1.23456 e "04/03/2024" all'americana). I file Excel veri non ne sono influenzati.
 */
export function readFirstSheet(buffer: Buffer): SheetData {
  const head = buffer.subarray(0, 4);
  const isBinary = head.equals(ZIP_MAGIC) || head.equals(OLE_MAGIC);
  const workbook = isBinary
    ? XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false })
    : XLSX.read(decodeText(buffer), { type: 'string', raw: true, cellDates: false });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const date1904 = !!(workbook as any).Workbook?.WBProps?.date1904;
  if (!sheet || !sheet['!ref']) return { rows: [], date1904 };

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows: (SheetCell | null)[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: (SheetCell | null)[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined || cell.v === null || cell.v === '') {
        row.push(null);
      } else {
        row.push({ v: cell.v, t: cell.t, w: cell.w });
      }
    }
    rows.push(row);
  }
  return { rows, date1904 };
}

export class DateParseError extends Error {}

function buildDate(y: number, m: number, d: number, original: unknown, twoDigitYear = false): string {
  // solo un anno scritto con due cifre ("24") si completa; "0099" resta l'anno 99 (e viene rifiutato sotto)
  if (twoDigitYear) y += y >= 70 ? 1900 : 2000;
  if (y < 1900 || y > 2199) throw new DateParseError(`Data non valida: ${original} (anno fuori dall'intervallo 1900-2199)`);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new DateParseError(`Data non valida: ${original}`);
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Data come stringa 'YYYY-MM-DD' (nessun oggetto Date: niente slittamenti di fuso orario).
 * Numeri = data seriale Excel (rispettando il sistema 1904); testi solo nei formati espliciti italiani o ISO.
 */
export function parseDateCell(value: unknown, date1904 = false): string {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed) throw new DateParseError(`Data non valida: ${value}`);
    return buildDate(parsed.y, parsed.m, parsed.d, value);
  }
  if (value instanceof Date) {
    return buildDate(value.getFullYear(), value.getMonth() + 1, value.getDate(), value);
  }
  const str = String(value).trim();

  // GG/MM/AAAA, GG/MM/AA, GG.MM.AAAA, GG-MM-AAAA (eventuale orario ignorato)
  let match = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T].*)?$/);
  if (match) return buildDate(Number(match[3]), Number(match[2]), Number(match[1]), value, match[3].length === 2);

  // AAAA-MM-GG (ISO, eventuale orario ignorato)
  match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (match) return buildDate(Number(match[1]), Number(match[2]), Number(match[3]), value);

  throw new DateParseError(`Formato data non valido: ${value} (usa GG/MM/AAAA)`);
}
