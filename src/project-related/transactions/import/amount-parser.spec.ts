import { detectDecimalSeparator, legacyStoredAmount, parseAmountCell, parseAmountText, roundToCents } from './amount-parser';

describe('parseAmountText', () => {
  const ok: [string, number][] = [
    ['1234', 1234],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['€ 1.234,56', 1234.56],
    ['1.234,56 €', 1234.56],
    ['EUR 1.234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['1 234,56', 1234.56],
    ["1'234.50", 1234.5],
    ['12.345.678,9', 12345678.9],
    ['12,345,678.90', 12345678.9],
    ['1.234', 1234],
    ['1,234', 1234],
    ['12.345', 12345],
    ['999,99', 999.99],
    ['0,5', 0.5],
    ['12,5', 12.5],
    ['-1.234,50', -1234.5],
    ['1.234,50-', -1234.5],
    ['(1.234,50)', -1234.5],
    ['−1.234,56', -1234.56],
    ['+15,00', 15],
    ['1.234,56 CR', 1234.56],
    ['1.234,56 DR', -1234.56],
    ['1,005', 1005],
    ['5.560,00', 5560],
    ['1.000.000', 1000000],
  ];
  it.each(ok)('"%s" → %s', (input, expected) => {
    expect(parseAmountText(input)).toBe(expected);
  });

  const ko = ['', 'abc', '12abc', '1.234.56', '12.34.56', '1234.567', '1234,500', '1,23,456', '2,000.5.1', '1.5E+03', '0,125', '1.234,567', '1.234,5,6'];
  it.each(ko)('rifiuta "%s"', (input) => {
    expect(() => parseAmountText(input)).toThrow();
  });

  it('usa il separatore della colonna per i casi a 3 cifre', () => {
    expect(() => parseAmountText('1,234', ',')).toThrow();
    expect(parseAmountText('1,234', '.')).toBe(1234);
    expect(parseAmountText('1.234', ',')).toBe(1234);
  });
});

describe('roundToCents / parseAmountCell', () => {
  it('arrotonda senza errori di virgola mobile', () => {
    expect(roundToCents(1.005)).toBe(1.01);
    expect(roundToCents(6.734)).toBe(6.73);
    expect(roundToCents(-2.675)).toBe(-2.68);
    expect(roundToCents(1234.5)).toBe(1234.5);
  });
  it('i numeri delle celle Excel non passano dal testo', () => {
    expect(parseAmountCell(1234.56)).toBe(1234.56);
    expect(parseAmountCell(5560)).toBe(5560);
    expect(parseAmountCell('1.234,56')).toBe(1234.56);
  });
});

describe('detectDecimalSeparator', () => {
  it('riconosce lo stile italiano e inglese', () => {
    expect(detectDecimalSeparator(['12,50', '1.234', '3,1'])).toBe(',');
    expect(detectDecimalSeparator(['1,234.56', '12.5'])).toBe('.');
    expect(detectDecimalSeparator(['1.234', '5.560'])).toBeUndefined();
  });
});

describe('legacyStoredAmount (riproduce il bug v1.3)', () => {
  it('ritrova il valore salvato male', () => {
    expect(legacyStoredAmount('1,234.56')).toBe(1.23);
    expect(legacyStoredAmount('5,560.00')).toBe(5.56);
    expect(legacyStoredAmount('6,734.00')).toBe(6.73);
    expect(legacyStoredAmount('12,345.67')).toBe(12.35);
    expect(legacyStoredAmount('1,000,000.00')).toBe(1);
    expect(legacyStoredAmount('999.99')).toBe(999.99);
    expect(legacyStoredAmount('-1,250.00')).toBe(1.25);
    expect(legacyStoredAmount('€ 1,234.56')).toBe(1.23);
  });
});
