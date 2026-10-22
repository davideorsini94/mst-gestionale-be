import { formatEuro, roundMoney } from './money';

describe('roundMoney', () => {
  it.each([
    [0.005, 0.01],
    [1.005, 1.01],
    [10.004, 10],
    [12.345, 12.35],
    [100, 100],
    [-1.005, -1.01],
  ])('%p → %p', (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });
});

describe('formatEuro', () => {
  it.each([
    [1234.56, '€ 1.234,56'],
    [1234.5, '€ 1.234,50'],
    ['50', '€ 50,00'],
    [1234567.8, '€ 1.234.567,80'],
    [0.01, '€ 0,01'],
  ])('%p → %p', (input, expected) => {
    expect(formatEuro(input as any)).toBe(expected);
  });
});
