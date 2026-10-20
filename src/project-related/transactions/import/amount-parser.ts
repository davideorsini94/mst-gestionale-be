/**
 * Parsing degli importi letti da Excel/CSV.
 *
 * Bug v1.3: il testo formattato "1,234.56" diventava "1.234.56" (replace della prima virgola) e parseFloat leggeva
 * 1.234 → salvato 1,23 €. Qui il testo deve corrispondere per intero a un formato riconosciuto, altrimenti la riga
 * va in errore: un importo non si indovina mai.
 */

export type DecimalSeparator = ',' | '.';

export class AmountParseError extends Error {}

const CURRENCY_AND_SPACES = /[€$£\s   ']/g;
const UNICODE_MINUS = /[−‒–—]/g;

interface CleanedAmount {
  digits: string;
  negative: boolean;
}

function clean(input: string): CleanedAmount {
  let text = String(input).trim().replace(UNICODE_MINUS, '-');
  let negative = false;

  // Suffissi contabili: CR/A (avere) = positivo, DR/D (dare) = negativo
  const suffix = text.match(/\s*(CR|DR|D|A)\.?$/i);
  if (suffix && /\d/.test(text.slice(0, suffix.index))) {
    const s = suffix[1].toUpperCase();
    if (s === 'DR' || s === 'D') negative = true;
    text = text.slice(0, suffix.index);
  }

  text = text.replace(/^(EUR|EURO)\s*/i, '').replace(/\s*(EUR|EURO)$/i, '');
  text = text.replace(CURRENCY_AND_SPACES, '');

  // Parentesi contabili (1.234,50) = negativo
  if (/^\(.*\)$/.test(text)) {
    negative = !negative;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  return { digits: text, negative };
}

/** Arrotondamento ai centesimi sulla stringa decimale (niente errori di virgola mobile: 1.005 → 1.01). */
export function roundDecimalString(intPart: string, fracPart: string): number {
  const frac = (fracPart + '000').slice(0, 3);
  let cents = BigInt((intPart || '0') + frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1n;
  return Number(cents) / 100;
}

export function roundToCents(value: number): number {
  if (!isFinite(value)) throw new AmountParseError(`Numero non valido: ${value}`);
  const negative = value < 0;
  // toFixed(10) evita la rappresentazione binaria (1.005 → "1.0050000000")
  const [i, f = ''] = Math.abs(value).toFixed(10).split('.');
  const rounded = roundDecimalString(i, f);
  return negative ? -rounded : rounded;
}

/**
 * Converte un testo in importo.
 * @param decimalHint separatore decimale dedotto dalle altre celle della stessa colonna (risolve "1.234" / "1,234")
 */
export function parseAmountText(input: string, decimalHint?: DecimalSeparator): number {
  const original = String(input);
  const { digits, negative } = clean(original);
  if (!digits) throw new AmountParseError(`Importo vuoto: "${original}"`);

  let intPart: string;
  let fracPart = '';

  const plain = digits.match(/^(\d+)(?:([.,])(\d+))?$/);
  const grouped = digits.match(/^(\d{1,3})((?:([.,])\d{3})+)(?:([.,])(\d{1,2}))?$/);

  if (grouped && (grouped[2].length > 4 || grouped[4])) {
    // Raggruppamento delle migliaia esplicito: "1.234.567", "1.234,56", "12,345.67"
    const groupSep = grouped[3];
    const decSep = grouped[4];
    if (decSep && decSep === groupSep) {
      throw new AmountParseError(`Importo ambiguo: "${original}"`);
    }
    if (new Set(grouped[2].replace(/\d/g, '')).size !== 1) {
      // separatori delle migliaia misti ("1.234,567")
      throw new AmountParseError(`Importo non valido: "${original}"`);
    }
    intPart = grouped[1] + grouped[2].split(groupSep).join('');
    fracPart = grouped[5] ?? '';
  } else if (plain) {
    intPart = plain[1];
    const sep = plain[2] as DecimalSeparator | undefined;
    const tail = plain[3] ?? '';
    if (sep) {
      if (tail.length === 3 && intPart !== '0' && intPart.length <= 3) {
        // "1.234" o "1,234": migliaia, a meno che la colonna usi proprio quel separatore come decimale
        if (decimalHint === sep) {
          throw new AmountParseError(`Importo ambiguo (3 decimali): "${original}"`);
        }
        intPart += tail;
      } else if (tail.length <= 2) {
        fracPart = tail;
      } else {
        throw new AmountParseError(`Importo non valido: "${original}"`);
      }
    }
  } else {
    throw new AmountParseError(`Importo non valido: "${original}"`);
  }

  const value = roundDecimalString(intPart, fracPart);
  return negative ? -value : value;
}

/**
 * Deduce il separatore decimale di una colonna dai valori non ambigui ("12,50" → virgola, "1.234,56" → virgola,
 * "12.5" → punto). Restituisce undefined se non c'è evidenza.
 */
export function detectDecimalSeparator(texts: string[]): DecimalSeparator | undefined {
  let comma = 0;
  let dot = 0;
  for (const raw of texts) {
    const { digits } = clean(raw);
    let decimal: string | undefined;
    if (digits.includes(',') && digits.includes('.')) {
      // con due separatori diversi, l'ultimo è quello decimale
      decimal = digits.lastIndexOf(',') > digits.lastIndexOf('.') ? ',' : '.';
    } else {
      const single = digits.match(/^\d+([.,])(\d{1,2})$/);
      if (single) decimal = single[1];
    }
    if (decimal === ',') comma++;
    else if (decimal === '.') dot++;
  }
  if (comma > dot) return ',';
  if (dot > comma) return '.';
  return undefined;
}

/** Importo da una cella: i numeri veri si usano così come sono, i testi passano dal parser rigoroso. */
export function parseAmountCell(value: unknown, decimalHint?: DecimalSeparator): number {
  if (typeof value === 'number') return roundToCents(value);
  return parseAmountText(String(value), decimalHint);
}

/**
 * Riproduce ESATTAMENTE il vecchio parser v1.3 (raw:false + replace(',', '.') + parseFloat) e l'arrotondamento
 * della colonna numeric(10,2): serve a ritrovare le righe salvate male per correggerle invece di duplicarle.
 */
export function legacyStoredAmount(formattedText: unknown, rawValue?: unknown): number | null {
  let parsed: number;
  if (formattedText === undefined || formattedText === null) {
    if (typeof rawValue !== 'number') return null;
    parsed = rawValue;
  } else if (typeof formattedText === 'number') {
    parsed = formattedText;
  } else {
    const str = String(formattedText).trim().replace(',', '.').replace(/[€\s]/g, '');
    parsed = parseFloat(str);
  }
  if (isNaN(parsed)) return null;
  // L'importo veniva salvato in valore assoluto
  return roundToCents(Math.abs(parsed));
}
