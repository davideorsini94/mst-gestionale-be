import { toDateOnlyString } from './encrypted-column';

describe('toDateOnlyString', () => {
  it('restituisce sempre YYYY-MM-DD', () => {
    expect(toDateOnlyString('2000-01-15')).toBe('2000-01-15');
    expect(toDateOnlyString('2000-01-15T00:00:00.000Z')).toBe('2000-01-15');
    expect(toDateOnlyString(new Date(2000, 0, 15))).toBe('2000-01-15');
    expect(toDateOnlyString('2024-02-29')).toBe('2024-02-29');
    expect(toDateOnlyString(null)).toBeNull();
    expect(toDateOnlyString('')).toBeNull();
  });

  it('rifiuta date impossibili e anni fuori intervallo', () => {
    expect(() => toDateOnlyString('2023-02-30')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('2023-02-29')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('1900-02-29')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('2023-13-01')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('2023-00-10')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('0000-01-01')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('-002023-01-01')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('+012023-01-01')).toThrow(/Data non valida/);
    expect(() => toDateOnlyString(new Date('invalid'))).toThrow(/Data non valida/);
    expect(() => toDateOnlyString('non è una data')).toThrow(/Data non valida/);
  });
});
